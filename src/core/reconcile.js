const { isSmartColumn, normalizeColumns } = require("../columns/column-model");
const { uniqueIds } = require("../utils/text");

function reconcileDashboard(dashboard, tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  const byCategory = new Map();
  for (const task of tasks) {
    if (!byCategory.has(task.category)) byCategory.set(task.category, []);
    byCategory.get(task.category).push(task.id);
  }

  dashboard.today.taskIds = uniqueIds(dashboard.today.taskIds).filter((id) => ids.has(id));
  dashboard.columns = normalizeColumns(dashboard.columns);

  for (const column of dashboard.columns) {
    if (isSmartColumn(column) && column.smartType === "deadline") {
      column.taskIds = tasks
        .filter((task) => task.dueDate)
        .sort(compareDeadlineTasks)
        .map((task) => task.id);
      continue;
    }
    const categoryIds = byCategory.get(column.id) || [];
    const existing = uniqueIds(column.taskIds).filter((id) => categoryIds.includes(id));
    const missing = categoryIds.filter((id) => !existing.includes(id));
    column.taskIds = existing.concat(missing);
  }
}

function compareDeadlineTasks(a, b) {
  const due = a.dueDate.localeCompare(b.dueDate);
  if (due !== 0) return due;
  return (a.title || a.id).localeCompare(b.title || b.id);
}

module.exports = {
  reconcileDashboard
};
