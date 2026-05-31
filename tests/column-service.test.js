const assert = require("node:assert/strict");
const test = require("node:test");

const { moveColumnInList, moveColumnToGroupEnd, moveColumnToTarget } = require("../src/columns/column-service");

function ids(columns) {
  return columns.map((column) => column.id);
}

function columns() {
  return [
    { id: "a", layoutGroup: "primary" },
    { id: "b", layoutGroup: "secondary" },
    { id: "c", layoutGroup: "secondary" }
  ];
}

test("moves columns by button direction", () => {
  assert.deepEqual(ids(moveColumnInList(columns(), "b", -1)), ["b", "a", "c"]);
  assert.deepEqual(ids(moveColumnInList(columns(), "b", 1)), ["a", "c", "b"]);
  assert.deepEqual(ids(moveColumnInList(columns(), "a", -1)), ["a", "b", "c"]);
});

test("normalizes adjacent drag placement so swaps do not become no-ops", () => {
  assert.deepEqual(ids(moveColumnToTarget(columns(), "a", "b", "secondary", "before")), ["b", "a", "c"]);
  assert.deepEqual(ids(moveColumnToTarget(columns(), "b", "a", "secondary", "after")), ["b", "a", "c"]);
});

test("moves columns across layout groups", () => {
  const moved = moveColumnToTarget(columns(), "c", "a", "primary", "before");

  assert.deepEqual(ids(moved), ["c", "a", "b"]);
  assert.equal(moved[0].layoutGroup, "primary");
});

test("moves columns to the end of a layout group", () => {
  const moved = moveColumnToGroupEnd(columns(), "a", "secondary");

  assert.deepEqual(ids(moved), ["b", "c", "a"]);
  assert.equal(moved[2].layoutGroup, "secondary");
});
