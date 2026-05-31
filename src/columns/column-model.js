const { DEFAULT_CONFIG } = require("../core/defaults");
const { clean, normalizeTag, slugify, uniqueColumnId, uniqueIds, uniqueTag } = require("../utils/text");

const SMART_TYPES = new Set(["deadline"]);

function normalizeColumns(columns, fallbackColumns = DEFAULT_CONFIG.dashboards[0].columns) {
  const source = Array.isArray(columns) && columns.length > 0
    ? columns
    : fallbackColumns;
  const usedIds = new Set();
  const usedTags = new Set();
  const normalized = [];
  for (const column of source) {
    if (normalizeColumnType(column) === "smart" && normalizeSmartType(column, clean(column?.id)) === "deadline") {
      usedTags.add("#deadline");
    }
  }
  for (const column of source) {
    const name = clean(column.name) || "Column";
    const id = uniqueColumnId(clean(column.id) || slugify(name) || "column", usedIds);
    const type = normalizeColumnType(column);
    if (type === "smart") {
      const smartType = normalizeSmartType(column, id);
      reserveSmartTags(smartType, usedTags);
      normalized.push({
        id,
        name,
        type: "smart",
        smartType,
        layoutGroup: column.layoutGroup === "primary" ? "primary" : "secondary",
        taskIds: uniqueIds(column.taskIds)
      });
      continue;
    }
    const categoryTag = uniqueTag(normalizeTag(column.categoryTag) || `#${id}`, usedTags);
    normalized.push({
      id,
      name,
      type: "manual",
      categoryTag,
      layoutGroup: column.layoutGroup === "primary" ? "primary" : "secondary",
      taskIds: uniqueIds(column.taskIds)
    });
  }
  if (!normalized.some(isManualColumn)) {
    normalized.push({
      id: uniqueColumnId("inbox", usedIds),
      name: "Inbox",
      type: "manual",
      categoryTag: uniqueTag("#inbox", usedTags),
      layoutGroup: "secondary",
      taskIds: []
    });
  }
  return normalized;
}

function stripColumnState(column) {
  const base = {
    id: column.id,
    name: column.name,
    type: column.type === "smart" ? "smart" : "manual",
    layoutGroup: column.layoutGroup === "primary" ? "primary" : "secondary"
  };
  if (base.type === "smart") {
    base.smartType = normalizeSmartType(column, column.id);
  } else {
    base.categoryTag = column.categoryTag;
  }
  return base;
}

function defaultColumnId(columns) {
  const manual = getManualColumns(columns);
  return manual.find((column) => column.id === "inbox")?.id || manual[0]?.id || "";
}

function categoryName(category, columns) {
  const column = getManualColumns(columns).find((item) => item.id === category);
  return column ? column.name : category;
}

function tagForCategory(category, columns) {
  const manual = getManualColumns(columns);
  const column = manual.find((item) => item.id === category);
  const fallback = manual.find((item) => item.id === "inbox") || manual[0];
  return column ? column.categoryTag : fallback?.categoryTag || "#inbox";
}

function getManualColumns(columns) {
  return (columns || []).filter(isManualColumn);
}

function isManualColumn(column) {
  return column?.type !== "smart";
}

function isSmartColumn(column) {
  return column?.type === "smart";
}

function deprecatedCategoryTags(columns) {
  const manualTags = new Set(getManualColumns(columns).map((column) => column.categoryTag).filter(Boolean));
  const tags = [];
  if ((columns || []).some((column) => isSmartColumn(column) && column.smartType === "deadline") && !manualTags.has("#deadline")) {
    tags.push("#deadline");
  }
  return tags;
}

function normalizeColumnType(column) {
  if (column?.type === "smart" || column?.smartType) return "smart";
  if (clean(column?.id) === "deadline" && normalizeTag(column?.categoryTag) === "#deadline") return "smart";
  return "manual";
}

function normalizeSmartType(column, id) {
  if (SMART_TYPES.has(column?.smartType)) return column.smartType;
  if (id === "deadline") return "deadline";
  return "deadline";
}

function reserveSmartTags(smartType, usedTags) {
  if (smartType === "deadline") usedTags.add("#deadline");
}

module.exports = {
  normalizeColumns,
  stripColumnState,
  defaultColumnId,
  categoryName,
  tagForCategory,
  getManualColumns,
  isManualColumn,
  isSmartColumn,
  deprecatedCategoryTags
};
