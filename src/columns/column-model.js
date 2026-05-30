const { DEFAULT_CONFIG } = require("../core/defaults");
const { clean, normalizeTag, slugify, uniqueColumnId, uniqueIds, uniqueTag } = require("../utils/text");

function normalizeColumns(columns, fallbackColumns = DEFAULT_CONFIG.dashboards[0].columns) {
  const source = Array.isArray(columns) && columns.length > 0
    ? columns
    : fallbackColumns;
  const usedIds = new Set();
  const usedTags = new Set();
  const normalized = [];
  for (const column of source) {
    const name = clean(column.name) || "Column";
    const id = uniqueColumnId(clean(column.id) || slugify(name) || "column", usedIds);
    const categoryTag = uniqueTag(normalizeTag(column.categoryTag) || `#${id}`, usedTags);
    normalized.push({
      id,
      name,
      categoryTag,
      layoutGroup: column.layoutGroup === "primary" ? "primary" : "secondary",
      taskIds: uniqueIds(column.taskIds)
    });
  }
  return normalized;
}

function stripColumnState(column) {
  return {
    id: column.id,
    name: column.name,
    categoryTag: column.categoryTag,
    layoutGroup: column.layoutGroup === "primary" ? "primary" : "secondary"
  };
}

function defaultColumnId(columns) {
  return columns.find((column) => column.id === "inbox")?.id || columns[0]?.id || "";
}

function categoryName(category, columns) {
  const column = columns.find((item) => item.id === category);
  return column ? column.name : category;
}

function tagForCategory(category, columns) {
  const column = columns.find((item) => item.id === category);
  return column ? column.categoryTag : "#inbox";
}

module.exports = {
  normalizeColumns,
  stripColumnState,
  defaultColumnId,
  categoryName,
  tagForCategory
};
