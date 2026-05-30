const { clean } = require("./text");

function normalizeSourceInput(value) {
  const input = clean(value);
  if (!input) return "";
  if (input.startsWith("[[")) return input;
  const label = displayPathLabel(input);
  return `[[${input}|${label}]]`;
}

function sourceToInputValue(value) {
  const source = clean(value);
  if (!source) return "";
  const match = source.match(/\[\[([^|\]]+)/);
  return match ? match[1] : source;
}

function displaySourceLabel(value) {
  const target = sourceToInputValue(value);
  return displayPathLabel(target);
}

function displayPathLabel(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("/").pop();
}

function getProjectRoot(path) {
  const parts = path.split("/");
  const index = parts.indexOf("Projects");
  if (index < 0 || parts.length <= index + 1) return "";
  return parts.slice(0, index + 2).join("/");
}

function parseWikiTarget(source) {
  const cleaned = clean(source);
  const match = cleaned.match(/\[\[([^|\]]+)/);
  return match ? match[1] : cleaned;
}

module.exports = {
  normalizeSourceInput,
  sourceToInputValue,
  displaySourceLabel,
  displayPathLabel,
  getProjectRoot,
  parseWikiTarget
};
