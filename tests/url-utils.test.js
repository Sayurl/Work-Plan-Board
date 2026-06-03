const test = require("node:test");
const assert = require("node:assert/strict");
const { extractFirstUrl } = require("../src/utils/urls");

test("extracts the first http URL from text", () => {
  assert.equal(extractFirstUrl("Meet at https://example.com/room today"), "https://example.com/room");
});

test("trims trailing sentence punctuation from URLs", () => {
  assert.equal(extractFirstUrl("Join https://example.com/room."), "https://example.com/room");
});

test("returns empty string when text has no URL", () => {
  assert.equal(extractFirstUrl("Conference room A"), "");
});
