const { META_KEYS } = require("../core/constants");
const { defaultColumnId, tagForCategory } = require("../columns/column-model");
const { clean } = require("../utils/text");
const { normalizeSourceInput } = require("../utils/source-links");

function parseTaskBlock(filePath, blockLines, lineStart, lineEnd, columns, options = {}) {
  const first = blockLines[0];
  const match = first.match(/^- \[([ xX])\] (.*)$/);
  if (!match) return null;
  const completed = match[1].toLowerCase() === "x";
  const rawBody = match[2];

  const meta = {};
  for (const line of blockLines.slice(1)) {
    const metaMatch = line.match(/^\s{2,}-\s*([^:]+):\s*(.*)$/);
    if (!metaMatch) continue;
    meta[metaMatch[1].trim()] = metaMatch[2].trim();
  }
  const id = meta[META_KEYS.id];
  if (!id) return null;

  const categoryTagsByTag = new Map(columns.map((column) => [column.categoryTag, column.id]));
  const bodyTags = [...rawBody.matchAll(/(^|\s)(#[\w-]+)/g)].map((item) => item[2]);
  const categoryTags = bodyTags.filter((tag) => categoryTagsByTag.has(tag));
  let category = categoryTags.length === 1 ? categoryTagsByTag.get(categoryTags[0]) : "";
  let unknownCategoryTag = "";
  if (!category && options.allowUnknownCategory) {
    unknownCategoryTag = bodyTags.find((tag) => tag !== "#project" && !categoryTagsByTag.has(tag)) || "";
    category = options.defaultCategory || defaultColumnId(columns);
  }
  if (!category) return null;

  const due = rawBody.match(/📅\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  const estimate = rawBody.match(/⏱\s*([^\s]+)/);
  const project = meta[META_KEYS.project] || (rawBody.match(/#project\/([^\s]+)/) || [])[1] || "";
  const title = rawBody
    .replace(/#project\/[^\s]+/g, "")
    .replace(/#[\w-]+/g, "")
    .replace(/📅\s*[0-9]{4}-[0-9]{2}-[0-9]{2}/g, "")
    .replace(/⏱\s*[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id,
    title,
    completed,
    category,
    unknownCategoryTag,
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
  const parts = [`- [${task.completed ? "x" : " "}] ${task.title}`, tagForCategory(task.category, columns)];
  if (task.dueDate) parts.push(`📅 ${task.dueDate}`);
  if (task.estimate) parts.push(`⏱ ${task.estimate}`);

  const lines = [parts.join(" ")];
  lines.push(`  - id: ${task.id}`);
  addMeta(lines, META_KEYS.project, task.project);
  addMeta(lines, META_KEYS.source, normalizeSourceInput(task.source));
  addMeta(lines, META_KEYS.nextAction, task.nextAction);
  addMeta(lines, META_KEYS.waitingFor, task.waitingFor);
  addMeta(lines, META_KEYS.followUpDate, task.followUpDate);
  addMeta(lines, META_KEYS.goal, task.goal);
  addMeta(lines, META_KEYS.comment, task.comment);
  return lines.join("\n");
}

function addMeta(lines, key, value) {
  if (clean(value)) lines.push(`  - ${key}: ${clean(value)}`);
}

module.exports = {
  parseTaskBlock,
  renderTaskMarkdown
};
