const assert = require("node:assert/strict");
const test = require("node:test");

const { parseTaskBlock, renderTaskMarkdown } = require("../src/tasks/task-markdown");

const columns = [
  { id: "high-priority", name: "High Priority", categoryTag: "#high-priority", layoutGroup: "primary" },
  { id: "inbox", name: "Inbox", categoryTag: "#inbox", layoutGroup: "secondary" }
];

test("parses managed task markdown blocks", () => {
  const task = parseTaskBlock("_Tasks.md", [
    "- [ ] Write migration tests #high-priority 📅 2026-06-01 ⏱ 1h",
    "  - id: task-1",
    "  - フォルダ: Project Task Board",
    "  - 由来: [[Project Task Board/Project Task Board アップデート予定|Project Task Board アップデート予定]]",
    "  - 次の一手: Add tests",
    "  - コメント: Keep this stable"
  ], 0, 6, columns);

  assert.equal(task.id, "task-1");
  assert.equal(task.title, "Write migration tests");
  assert.equal(task.category, "high-priority");
  assert.equal(task.dueDate, "2026-06-01");
  assert.equal(task.estimate, "1h");
  assert.equal(task.project, "Project Task Board");
  assert.equal(task.nextAction, "Add tests");
});

test("renders task markdown with configured category tags", () => {
  const markdown = renderTaskMarkdown({
    id: "task-2",
    title: "Render config-backed task",
    completed: false,
    category: "inbox",
    project: "Project Task Board",
    dueDate: "2026-06-02",
    estimate: "30m",
    source: "Project Task Board/Project Task Board アップデート予定",
    nextAction: "Run tests",
    waitingFor: "",
    followUpDate: "",
    goal: "",
    comment: "Rendered from test"
  }, columns);

  assert.match(markdown, /^- \[ \] Render config-backed task #inbox 📅 2026-06-02 ⏱ 30m/m);
  assert.match(markdown, /  - id: task-2/);
  assert.match(markdown, /  - 由来: \[\[Project Task Board\/Project Task Board アップデート予定\|Project Task Board アップデート予定\]\]/);
});

test("can parse unknown category tags as inbox during reconcile", () => {
  const task = parseTaskBlock("_Tasks.md", [
    "- [ ] Legacy category task #old-column",
    "  - id: task-3"
  ], 0, 2, columns, {
    allowUnknownCategory: true,
    defaultCategory: "inbox"
  });

  assert.equal(task.category, "inbox");
  assert.equal(task.unknownCategoryTag, "#old-column");
});
