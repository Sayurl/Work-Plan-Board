function moveColumnInList(columns, columnId, direction) {
  const next = columns.slice();
  const index = next.findIndex((column) => column.id === columnId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return columns;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function moveColumnToTarget(columns, columnId, targetId, layoutGroup, placement = "before") {
  if (columnId === targetId) return columns;
  const next = columns.slice();
  const index = next.findIndex((column) => column.id === columnId);
  if (index < 0) return columns;
  const normalizedPlacement = normalizeColumnPlacement(next, columnId, targetId, placement);
  const [column] = next.splice(index, 1);
  column.layoutGroup = layoutGroup === "primary" ? "primary" : "secondary";
  const target = targetId ? next.findIndex((item) => item.id === targetId) : -1;
  if (target >= 0) next.splice(normalizedPlacement === "after" ? target + 1 : target, 0, column);
  else next.push(column);
  return next;
}

function normalizeColumnPlacement(columns, columnId, targetId, placement) {
  if (!targetId) return placement;
  const sourceIndex = columns.findIndex((column) => column.id === columnId);
  const targetIndex = columns.findIndex((column) => column.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return placement;
  if (sourceIndex < targetIndex && placement === "before") return "after";
  if (sourceIndex > targetIndex && placement === "after") return "before";
  return placement;
}

function moveColumnToGroupEnd(columns, columnId, layoutGroup) {
  const normalizedGroup = layoutGroup === "primary" ? "primary" : "secondary";
  const groupColumns = columns.filter((column) => (column.layoutGroup === "primary" ? "primary" : "secondary") === normalizedGroup && column.id !== columnId);
  const lastColumn = groupColumns[groupColumns.length - 1];
  if (lastColumn) return moveColumnToTarget(columns, columnId, lastColumn.id, normalizedGroup, "after");
  const next = columns.slice();
  const column = next.find((item) => item.id === columnId);
  if (!column) return columns;
  column.layoutGroup = normalizedGroup;
  return next;
}

module.exports = {
  moveColumnInList,
  moveColumnToTarget,
  moveColumnToGroupEnd,
  normalizeColumnPlacement
};
