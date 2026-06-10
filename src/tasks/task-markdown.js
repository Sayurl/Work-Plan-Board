const { META_KEYS } = require("../core/constants");
const { defaultColumnId, getManualColumns, tagForCategory } = require("../columns/column-model");
const { clean } = require("../utils/text");
const { normalizeSourceInput } = require("../utils/source-links");

function parseTaskBlock(filePath, blockLines, lineStart, lineEnd, columns, options = {}) {
  const first = blockLines[0];
  const match = first.match(/^- \[([ xX])\] (.*)$/);
  if (!match) return null;
  const completed = match[1].toLowerCase() === "x";
  const rawBody = match[2];

  const meta = {};
  for (let index = 1; index < blockLines.length; index += 1) {
    const line = blockLines[index];
    const metaMatch = line.match(/^\s{2,}-\s*([^:]+):\s*(.*)$/);
    if (!metaMatch) continue;
    const key = metaMatch[1].trim();
    const value = metaMatch[2].trim();
    const blockValue = parseBlockMetaValue(blockLines, index, value);
    if (blockValue) {
      meta[key] = blockValue.value;
      index = blockValue.endIndex;
    } else {
      meta[key] = value;
    }
  }
  const id = meta[META_KEYS.id];
  if (!id) return null;

  const categoryTagsByTag = new Map(getManualColumns(columns).map((column) => [column.categoryTag, column.id]));
  const deprecatedTags = new Set(options.deprecatedCategoryTags || []);
  const bodyTags = [...rawBody.matchAll(/(^|\s)(#[\w-]+)/g)].map((item) => item[2]);
  const categoryTags = bodyTags.filter((tag) => categoryTagsByTag.has(tag));
  let category = categoryTags.length === 1 ? categoryTagsByTag.get(categoryTags[0]) : "";
  let unknownCategoryTag = "";
  const deprecatedCategoryTags = bodyTags.filter((tag) => deprecatedTags.has(tag));
  if (!category && options.allowUnknownCategory) {
    unknownCategoryTag = bodyTags.find((tag) => tag !== "#project" && !categoryTagsByTag.has(tag)) || "";
    category = options.defaultCategory || defaultColumnId(columns);
  }
  if (!category) return null;

  const due = findUnescapedMatch(rawBody, /📅\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/g);
  const estimate = findUnescapedMatch(rawBody, /⏱\s*([^\s]+)/g);
  const project = meta[META_KEYS.project] || findProjectTag(rawBody) || "";
  const title = unescapeInlineTaskText(stripInlineTaskSyntax(rawBody))
    .replace(/\s+/g, " ")
    .trim();

  return {
    id,
    title,
    completed,
    category,
    unknownCategoryTag,
    deprecatedCategoryTags,
    project,
    dueDate: due ? due[1] : "",
    estimate: estimate ? estimate[1] : "",
    source: meta[META_KEYS.source] || "",
    nextAction: meta[META_KEYS.nextAction] || "",
    waitingFor: meta[META_KEYS.waitingFor] || "",
    followUpDate: meta[META_KEYS.followUpDate] || "",
    goal: meta[META_KEYS.goal] || "",
    comment: meta[META_KEYS.comment] || "",
    filePath,
    lineStart,
    lineEnd
  };
}

function renderTaskMarkdown(task, columns) {
  const parts = [`- [${task.completed ? "x" : " "}] ${escapeInlineTaskText(task.title)}`, tagForCategory(task.category, columns)];
  const dueDate = dateValue(task.dueDate);
  const estimate = tokenValue(task.estimate);
  if (dueDate) parts.push(`📅 ${dueDate}`);
  if (estimate) parts.push(`⏱ ${estimate}`);

  const lines = [parts.join(" ")];
  lines.push(`  - id: ${oneLine(task.id)}`);
  addMeta(lines, META_KEYS.project, task.project);
  addMeta(lines, META_KEYS.source, normalizeSourceInput(oneLine(task.source)));
  addMeta(lines, META_KEYS.nextAction, task.nextAction);
  addMeta(lines, META_KEYS.waitingFor, task.waitingFor);
  addMeta(lines, META_KEYS.followUpDate, task.followUpDate);
  addMeta(lines, META_KEYS.goal, task.goal);
  addBlockMeta(lines, META_KEYS.comment, task.comment);
  return lines.join("\n");
}

function addMeta(lines, key, value) {
  const text = oneLine(value);
  if (text) lines.push(`  - ${key}: ${text}`);
}

function addBlockMeta(lines, key, value) {
  const text = blockText(value);
  if (!text) return;
  if (!text.includes("\n")) {
    lines.push(`  - ${key}: ${text}`);
    return;
  }
  lines.push(`  - ${key}: |-`);
  for (const line of text.split("\n")) {
    lines.push(`    ${line}`);
  }
}

function parseBlockMetaValue(lines, index, value) {
  if (!/^\|[-+]?$/.test(value)) return null;
  const blockLines = [];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const continuation = line.match(/^\s{4}(.*)$/);
    if (!continuation) break;
    blockLines.push(continuation[1]);
    cursor += 1;
  }
  if (blockLines.length === 0) return null;
  return {
    value: blockLines.join("\n"),
    endIndex: cursor - 1
  };
}

function oneLine(value) {
  return clean(value).replace(/[ \t]*[\r\n]+[ \t]*/g, " ").trim();
}

function blockText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function tokenValue(value) {
  return oneLine(value)
    .replace(/\s+/g, "-")
    .replace(/^#+/, "")
    .replace(/[📅⏱]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function dateValue(value) {
  const text = oneLine(value);
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text) ? text : "";
}

function escapeInlineTaskText(value) {
  return oneLine(value)
    .replace(/\\/g, "\\\\")
    .replace(/(^|\s)#/g, "$1\\#")
    .replace(/(^|[^\\])📅(?=\s*[0-9]{4}-[0-9]{2}-[0-9]{2})/g, "$1\\📅")
    .replace(/(^|[^\\])⏱(?=\s*\S+)/g, "$1\\⏱");
}

function unescapeInlineTaskText(value) {
  return String(value || "").replace(/\\([\\#📅⏱])/g, "$1");
}

function findUnescapedMatch(value, pattern) {
  const text = String(value || "");
  for (const match of text.matchAll(pattern)) {
    if (text[match.index - 1] !== "\\") return match;
  }
  return null;
}

function findProjectTag(value) {
  const text = String(value || "");
  for (const match of text.matchAll(/(^|\s)#project\/([^\s]+)/g)) {
    const tokenOffset = match.index + match[1].length;
    if (text[tokenOffset - 1] !== "\\") return match[2];
  }
  return "";
}

function stripInlineTaskSyntax(value) {
  let text = String(value || "");
  text = stripUnescapedPattern(text, /(^|\s)#project\/[^\s]+/g);
  text = stripUnescapedPattern(text, /(^|\s)#[\w-]+/g);
  text = stripUnescapedPattern(text, /📅\s*[0-9]{4}-[0-9]{2}-[0-9]{2}/g);
  text = stripUnescapedPattern(text, /⏱\s*[^\s]+/g);
  return text;
}

function stripUnescapedPattern(value, pattern) {
  const source = String(value || "");
  return source.replace(pattern, (...args) => {
    const match = args[0];
    const offset = args[args.length - 2];
    const captures = args.slice(1, -2);
    const prefix = typeof captures[0] === "string" ? captures[0] : "";
    const tokenOffset = prefix ? offset + prefix.length : offset;
    if (source[tokenOffset - 1] === "\\") return match;
    return prefix || "";
  });
}

module.exports = {
  parseTaskBlock,
  renderTaskMarkdown
};
