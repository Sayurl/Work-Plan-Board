const assert = require("node:assert/strict");
const test = require("node:test");

const { reconcileDashboard } = require("../src/core/reconcile");

test("reconciles Today and column task ids against scanned tasks", () => {
  const dashboard = {
    today: {
      taskIds: ["task-a", "missing", "task-a"]
    },
    columns: [
      {
        id: "high-priority",
        name: "High Priority",
        categoryTag: "#high-priority",
        layoutGroup: "primary",
        taskIds: ["task-b", "missing", "task-b"]
      },
      {
        id: "inbox",
        name: "Inbox",
        categoryTag: "#inbox",
        layoutGroup: "secondary",
        taskIds: []
      }
    ]
  };
  const tasks = [
    { id: "task-a", category: "high-priority" },
    { id: "task-b", category: "high-priority" },
    { id: "task-c", category: "inbox" }
  ];

  reconcileDashboard(dashboard, tasks);

  assert.deepEqual(dashboard.today.taskIds, ["task-a"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "high-priority").taskIds, ["task-b", "task-a"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "inbox").taskIds, ["task-c"]);
});
