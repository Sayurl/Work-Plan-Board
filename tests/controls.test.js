const assert = require("node:assert/strict");
const test = require("node:test");

const { parseTimeValue } = require("../src/ui/controls");

test("parses quarter-hour time select values", () => {
  assert.deepEqual(parseTimeValue("09:15"), { hour: 9, minute: "15" });
  assert.deepEqual(parseTimeValue("17:30"), { hour: 17, minute: "30" });
});

test("normalizes unsupported minute values to the nearest selectable default", () => {
  assert.deepEqual(parseTimeValue("10:17"), { hour: 10, minute: "00" });
});

test("allows 24:00 only for end time selects", () => {
  assert.deepEqual(parseTimeValue("24:00", true), { hour: 24, minute: "00" });
  assert.deepEqual(parseTimeValue("24:00", false), { hour: 23, minute: "45" });
});

test("falls back to a stable default for invalid time values", () => {
  assert.deepEqual(parseTimeValue("99:99"), { hour: 9, minute: "00" });
  assert.deepEqual(parseTimeValue(""), { hour: 9, minute: "00" });
});
