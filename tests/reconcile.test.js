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
        type: "manual",
        categoryTag: "#high-priority",
        layoutGroup: "primary",
        taskIds: ["task-b", "missing", "task-b"]
      },
      {
        id: "deadline",
        name: "Deadline",
        type: "smart",
        smartType: "deadline",
        layoutGroup: "primary",
        taskIds: ["stale"]
      },
      {
        id: "inbox",
        name: "Inbox",
        type: "manual",
        categoryTag: "#inbox",
        layoutGroup: "secondary",
        taskIds: []
      }
    ]
  };
  const tasks = [
    { id: "task-a", category: "high-priority", dueDate: "2026-06-03", title: "Later" },
    { id: "task-b", category: "high-priority", dueDate: "", title: "No due" },
    { id: "task-c", category: "inbox", dueDate: "2026-06-01", title: "Soon" }
  ];

  reconcileDashboard(dashboard, tasks);

  assert.deepEqual(dashboard.today.taskIds, ["task-a"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "high-priority").taskIds, ["task-b", "task-a"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "deadline").taskIds, ["task-c", "task-a"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "inbox").taskIds, ["task-c"]);
});
