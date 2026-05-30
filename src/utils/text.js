function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function normalizeTag(value) {
  const cleaned = clean(value).replace(/\s+/g, "-").toLowerCase();
  if (!cleaned) return "";
  return `#${cleaned.replace(/^#+/, "")}`;
}

function uniqueColumnId(baseId, usedIds) {
  let id = slugify(baseId) || "column";
  let index = 2;
  while (usedIds.has(id)) {
    id = `${slugify(baseId) || "column"}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

function uniqueTag(tag, usedTags) {
  const base = normalizeTag(tag) || "#column";
  let next = base;
  let index = 2;
  while (usedTags.has(next)) {
    next = `${base}-${index}`;
    index += 1;
  }
  usedTags.add(next);
  return next;
}

function makeColumnId(name, columns) {
  return uniqueColumnId(slugify(name) || "column", new Set(columns.map((column) => column.id)));
}

function makeTaskId() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.random().toString(16).slice(2, 8);
  return `task_${stamp}_${random}`;
}

module.exports = {
  clean,
  slugify,
  uniqueIds,
  normalizeTag,
  uniqueColumnId,
  uniqueTag,
  makeColumnId,
  makeTaskId
};
