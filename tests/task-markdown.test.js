const assert = require("node:assert/strict");
const test = require("node:test");

const { parseTaskBlock, renderTaskMarkdown } = require("../src/tasks/task-markdown");

const columns = [
  { id: "high-priority", name: "High Priority", type: "manual", categoryTag: "#high-priority", layoutGroup: "primary" },
  { id: "deadline", name: "Deadline", type: "smart", smartType: "deadline", layoutGroup: "primary" },
  { id: "inbox", name: "Inbox", type: "manual", categoryTag: "#inbox", layoutGroup: "secondary" }
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
  assert.equal(markdown.includes("#deadline"), false);
  assert.match(markdown, /  - id: task-2/);
  assert.match(markdown, /  - 由来: \[\[Project Task Board\/Project Task Board アップデート予定\|Project Task Board アップデート予定\]\]/);
});

test("keeps task input out of task markdown control syntax", () => {
  const markdown = renderTaskMarkdown({
    id: "task-escape",
    title: "Review #inbox 📅 2026-07-01 ⏱ 2h\n- [ ] forged #high-priority",
    completed: false,
    category: "inbox",
    project: "Project\n  - id: forged",
    dueDate: "2026-06-02",
    estimate: "30m",
    source: "",
    nextAction: "Run tests\n  - id: forged",
    waitingFor: "",
    followUpDate: "",
    goal: "",
    comment: ""
  }, columns);
  const parsed = parseTaskBlock("_Tasks.md", markdown.split("\n"), 0, markdown.split("\n").length, columns);

  assert.equal(markdown.includes("\n- [ ] forged"), false);
  assert.match(markdown, /^- \[ \] Review \\#inbox \\📅 2026-07-01 \\⏱ 2h - \[ \] forged \\#high-priority #inbox 📅 2026-06-02 ⏱ 30m/m);
  assert.equal(parsed.title, "Review #inbox 📅 2026-07-01 ⏱ 2h - [ ] forged #high-priority");
  assert.equal(parsed.category, "inbox");
  assert.equal(parsed.dueDate, "2026-06-02");
  assert.equal(parsed.estimate, "30m");
  assert.equal(parsed.project, "Project - id: forged");
  assert.equal(parsed.nextAction, "Run tests - id: forged");
});

test("round-trips multiline comments as block metadata", () => {
  const comment = "Line one\n- [ ] not a task #inbox\n  - id: nope\n\n**Bold**";
  const markdown = renderTaskMarkdown({
    id: "task-comment",
    title: "Comment task",
    completed: false,
    category: "inbox",
    project: "",
    dueDate: "",
    estimate: "",
    source: "",
    nextAction: "",
    waitingFor: "",
    followUpDate: "",
    goal: "",
    comment
  }, columns);
  const parsed = parseTaskBlock("_Tasks.md", markdown.split("\n"), 0, markdown.split("\n").length, columns);

  assert.match(markdown, /  - コメント: \|-/);
  assert.equal(markdown.includes("\n- [ ] not a task"), false);
  assert.equal(parsed.comment, comment);
});

test("keeps inline metadata values from adding task syntax", () => {
  const markdown = renderTaskMarkdown({
    id: "task-inline-meta",
    title: "Inline metadata task",
    completed: false,
    category: "inbox",
    project: "",
    dueDate: "2026-06-02\n#high-priority",
    estimate: "#high-priority 📅 2026-08-01",
    source: "",
    nextAction: "",
    waitingFor: "",
    followUpDate: "",
    goal: "",
    comment: ""
  }, columns);
  const parsed = parseTaskBlock("_Tasks.md", markdown.split("\n"), 0, markdown.split("\n").length, columns);

  assert.match(markdown, /^- \[ \] Inline metadata task #inbox ⏱ high-priority-2026-08-01/m);
  assert.equal(parsed.category, "inbox");
  assert.equal(parsed.dueDate, "");
  assert.equal(parsed.estimate, "high-priority-2026-08-01");
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

test("treats legacy deadline tags as deprecated category tags", () => {
  const task = parseTaskBlock("_Tasks.md", [
    "- [ ] Legacy deadline task #deadline 📅 2026-06-04",
    "  - id: task-4"
  ], 0, 2, columns, {
    allowUnknownCategory: true,
    defaultCategory: "inbox",
    deprecatedCategoryTags: ["#deadline"]
  });
  const markdown = renderTaskMarkdown(task, columns);

  assert.equal(task.category, "inbox");
  assert.equal(task.dueDate, "2026-06-04");
  assert.deepEqual(task.deprecatedCategoryTags, ["#deadline"]);
  assert.match(markdown, /^- \[ \] Legacy deadline task #inbox 📅 2026-06-04/m);
  assert.equal(markdown.includes("#deadline"), false);
});
