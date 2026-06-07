const BOARD_VIEW = "project-task-board-view";
const SCHEDULE_VIEW = "work-plan-schedule-view";
const SIDEBAR_VIEW = "project-task-board-sidebar";

const CATEGORY_COLUMNS = [
  { id: "high-priority", name: "High Priority", type: "manual", tag: "#high-priority", group: "primary" },
  { id: "deadline", name: "Deadline", type: "smart", smartType: "deadline", group: "primary" },
  { id: "prepare", name: "Prepare", type: "manual", tag: "#prepare", group: "secondary" },
  { id: "inbox", name: "Inbox", type: "manual", tag: "#inbox", group: "secondary" }
];

const META_KEYS = {
  id: "id",
  project: "フォルダ",
  source: "由来",
  nextAction: "次の一手",
  waitingFor: "相手",
  followUpDate: "次に確認する日",
  goal: "到達点",
  comment: "コメント"
};

module.exports = {
  BOARD_VIEW,
  SCHEDULE_VIEW,
  SIDEBAR_VIEW,
  CATEGORY_COLUMNS,
  META_KEYS
};
