const { clean } = require("../utils/text");

const TIME_BLOCK_RELATION_TYPES = ["before", "inside", "after", "related"];

const DEFAULT_TASK_TIME_LINK = {
  taskId: "",
  timeBlockId: "",
  relation: "related",
  syncDate: false
};

function normalizeTaskTimeLinks(links, options = {}) {
  const taskIds = options.taskIds || null;
  const timeBlockIds = options.timeBlockIds || null;
  const seen = new Set();
  const normalized = [];

  for (const link of Array.isArray(links) ? links : []) {
    const taskId = clean(link?.taskId);
    const timeBlockId = clean(link?.timeBlockId);
    if (!taskId || !timeBlockId) continue;
    if (taskIds && !taskIds.has(taskId)) continue;
    if (timeBlockIds && !timeBlockIds.has(timeBlockId)) continue;
    const key = `${taskId}:${timeBlockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      taskId,
      timeBlockId,
      relation: normalizeRelation(link?.relation),
      syncDate: Boolean(link?.syncDate)
    });
  }

  return normalized;
}

function normalizeRelation(value) {
  return TIME_BLOCK_RELATION_TYPES.includes(value) ? value : DEFAULT_TASK_TIME_LINK.relation;
}

module.exports = {
  TIME_BLOCK_RELATION_TYPES,
  normalizeTaskTimeLinks,
  normalizeRelation,
  DEFAULT_TASK_TIME_LINK
};
