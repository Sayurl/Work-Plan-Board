const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeTaskTimeLinks } = require("../src/planning/task-time-link-model");
const { getTimeBlocksForDate, normalizeTimeBlocks } = require("../src/planning/time-block-model");

test("normalizes and sorts time blocks for a date", () => {
  const blocks = normalizeTimeBlocks([
    { id: "b", title: "Afternoon", date: "2026-06-01", startTime: "15:00", endTime: "16:00" },
    { id: "a", title: "Morning", date: "2026-06-01", startTime: "09:00", endTime: "10:00" },
    { id: "bad", title: "", date: "not-a-date", startTime: "99:99", endTime: "08:00" }
  ]);

  assert.equal(blocks[2].title, "Untitled block");
  assert.equal(blocks[2].startTime, "09:00");
  assert.equal(blocks[2].endTime, "10:00");
  assert.deepEqual(getTimeBlocksForDate(blocks, "2026-06-01").map((block) => block.id), ["a", "b"]);
});

test("allows same-day blocks ending at 24:00", () => {
  const [block] = normalizeTimeBlocks([
    { id: "late", title: "Late work", date: "2026-06-01", startTime: "22:00", endTime: "24:00" }
  ]);

  assert.equal(block.startTime, "22:00");
  assert.equal(block.endTime, "24:00");
});

test("normalizes task-time links and removes invalid references", () => {
  const links = normalizeTaskTimeLinks([
    { taskId: "task-a", timeBlockId: "block-a", relation: "inside", syncDate: true },
    { taskId: "task-a", timeBlockId: "block-a", relation: "before" },
    { taskId: "task-b", timeBlockId: "missing", relation: "after" },
    { taskId: "missing", timeBlockId: "block-a", relation: "related" }
  ], {
    taskIds: new Set(["task-a", "task-b"]),
    timeBlockIds: new Set(["block-a"])
  });

  assert.deepEqual(links, [
    { taskId: "task-a", timeBlockId: "block-a", relation: "inside", syncDate: true }
  ]);
});
