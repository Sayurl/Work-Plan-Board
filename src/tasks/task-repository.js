const { Notice, TFile } = require("obsidian");
const { defaultColumnId } = require("../columns/column-model");
const { ensureFile } = require("../utils/vault");
const { parseTaskBlock, renderTaskMarkdown } = require("./task-markdown");

async function scanTasks(app, columns) {
  const taskFiles = app.vault
    .getMarkdownFiles()
    .filter((file) => file.name === "_Tasks.md");
  const tasks = [];
  const seen = new Set();

  for (const file of taskFiles) {
    const content = await app.vault.read(file);
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^- \[[ xX]\] /.test(line)) continue;

      let end = index + 1;
      while (end < lines.length && !/^- \[[ xX]\] /.test(lines[end])) {
        end += 1;
      }

      const task = parseTaskBlock(file.path, lines.slice(index, end), index, end, columns);
      if (!task || task.completed || seen.has(task.id)) {
        index = end - 1;
        continue;
      }
      seen.add(task.id);
      tasks.push(task);
      index = end - 1;
    }
  }

  return { tasks };
}

async function processCompletedTasks(app, columns, policy) {
  if (policy === "keep") return;

  const taskFiles = app.vault
    .getMarkdownFiles()
    .filter((file) => file.name === "_Tasks.md");

  for (const file of taskFiles) {
    const content = await app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const removals = [];
    const archiveBlocks = [];

    for (let index = 0; index < lines.length; index += 1) {
      if (!/^- \[[xX]\] /.test(lines[index])) continue;
      let end = index + 1;
      while (end < lines.length && !/^- \[[ xX]\] /.test(lines[end])) {
        end += 1;
      }
      const task = parseTaskBlock(file.path, lines.slice(index, end), index, end, columns);
      if (task && task.completed) {
        removals.push({ start: index, end });
        archiveBlocks.push(lines.slice(index, end).join("\n"));
      }
      index = end - 1;
    }

    if (removals.length === 0) continue;

    if (policy === "archive") {
      const donePath = file.path.split("/").slice(0, -1).concat("_Done.md").join("/") || "_Done.md";
      await ensureFile(app, donePath);
      const doneFile = app.vault.getAbstractFileByPath(donePath);
      const doneContent = await app.vault.read(doneFile);
      const archiveText = archiveBlocks.join("\n\n");
      const nextDone = doneContent.trim().length > 0
        ? `${doneContent.replace(/\s*$/, "\n\n")}${archiveText}\n`
        : `${archiveText}\n`;
      await app.vault.modify(doneFile, nextDone);
    }

    for (const removal of removals.reverse()) {
      lines.splice(removal.start, removal.end - removal.start);
      if (lines[removal.start] === "") lines.splice(removal.start, 1);
    }
    await app.vault.modify(file, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
}

async function reconcileInvalidTaskCategories(app, columns) {
  const fallbackCategory = defaultColumnId(columns);
  if (!fallbackCategory) return;
  const taskFiles = app.vault
    .getMarkdownFiles()
    .filter((file) => file.name === "_Tasks.md");

  for (const file of taskFiles) {
    const content = await app.vault.read(file);
    const lines = content.split(/\r?\n/);
    let changed = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^- \[[ xX]\] /.test(lines[index])) continue;
      let end = index + 1;
      while (end < lines.length && !/^- \[[ xX]\] /.test(lines[end])) {
        end += 1;
      }
      const task = parseTaskBlock(file.path, lines.slice(index, end), index, end, columns, {
        allowUnknownCategory: true,
        defaultCategory: fallbackCategory
      });
      if (task?.unknownCategoryTag) {
        const replacement = renderTaskMarkdown(task, columns).split("\n");
        lines.splice(index, end - index, ...replacement);
        end = index + replacement.length;
        changed = true;
      }
      index = end - 1;
    }
    if (changed) await app.vault.modify(file, lines.join("\n"));
  }
}

async function appendTask(app, task, columns) {
  await ensureFile(app, task.filePath);
  const file = app.vault.getAbstractFileByPath(task.filePath);
  const content = await app.vault.read(file);
  const addition = renderTaskMarkdown(task, columns);
  const nextContent = content.trim().length > 0
    ? `${content.replace(/\s*$/, "\n\n")}${addition}\n`
    : `${addition}\n`;
  await app.vault.modify(file, nextContent);
}

async function writeTask(app, task, columns) {
  const file = app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof TFile)) {
    new Notice(`Task file not found: ${task.filePath}`);
    return;
  }
  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);
  const replacement = renderTaskMarkdown(task, columns).split("\n");
  lines.splice(task.lineStart, task.lineEnd - task.lineStart, ...replacement);
  await app.vault.modify(file, lines.join("\n"));
}

module.exports = {
  scanTasks,
  processCompletedTasks,
  reconcileInvalidTaskCategories,
  appendTask,
  writeTask
};
