function extractFirstUrl(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/\bhttps?:\/\/[^\s<>"')\]]+/i);
  if (!match) return "";
  return match[0].replace(/[.,;:!?]+$/, "");
}

module.exports = {
  extractFirstUrl
};
