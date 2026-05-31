const assert = require("node:assert/strict");
const test = require("node:test");

const { migrateConfigFromLegacyData, normalizeConfig } = require("../src/core/config");
const { hydrateDashboard, normalizeData, syncConfigDataFromDashboard } = require("../src/core/data");

test("migrates legacy dashboard settings into config and task order into data", () => {
  const legacy = {
    dashboards: [
      {
        id: "main",
        name: "Legacy Board",
        today: {
          name: "Today",
          layoutGroup: "primary",
          taskIds: ["task-a", "task-a", "task-b"]
        },
        columns: [
          {
            id: "gmail",
            name: "Gmail",
            categoryTag: "#gmail",
            layoutGroup: "primary",
            taskIds: ["task-c", "task-c", "task-d"]
          },
          {
            id: "inbox",
            name: "Inbox",
            categoryTag: "#inbox",
            layoutGroup: "secondary",
            taskIds: ["task-e"]
          }
        ]
      }
    ],
    settings: {
      completedTaskPolicy: "archive"
    }
  };

  const config = normalizeConfig(migrateConfigFromLegacyData(legacy));
  const data = normalizeData(legacy, config);
  const dashboard = hydrateDashboard(config, data);

  assert.equal(config.dashboards[0].name, "Legacy Board");
  assert.equal(config.settings.completedTaskPolicy, "archive");
  assert.deepEqual(config.dashboards[0].columns.map((column) => column.id), ["gmail", "inbox"]);
  assert.deepEqual(config.dashboards[0].columns.map((column) => column.type), ["manual", "manual"]);
  assert.equal(config.dashboards[0].columns.some((column) => Object.hasOwn(column, "taskIds")), false);
  assert.deepEqual(data.dashboards[0].today.taskIds, ["task-a", "task-b"]);
  assert.deepEqual(data.dashboards[0].columnTaskIds.gmail, ["task-c", "task-d"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "gmail").taskIds, ["task-c", "task-d"]);
});

test("normalizes duplicate config column ids and tags", () => {
  const config = normalizeConfig({
    dashboards: [
      {
        columns: [
          { id: "dup", name: "One", categoryTag: "#same", layoutGroup: "primary" },
          { id: "dup", name: "Two", categoryTag: "#same", layoutGroup: "secondary" }
        ]
      }
    ]
  });

  assert.deepEqual(config.dashboards[0].columns.map((column) => column.id), ["dup", "dup-2"]);
  assert.deepEqual(config.dashboards[0].columns.map((column) => column.categoryTag), ["#same", "#same-2"]);
});

test("normalizes default deadline as a smart column", () => {
  const config = normalizeConfig({});
  const deadline = config.dashboards[0].columns.find((column) => column.id === "deadline");
  const data = normalizeData({}, config);
  const dashboard = hydrateDashboard(config, data);

  assert.equal(deadline.type, "smart");
  assert.equal(deadline.smartType, "deadline");
  assert.equal(Object.hasOwn(deadline, "categoryTag"), false);
  assert.deepEqual(Object.keys(data.dashboards[0].columnTaskIds), ["high-priority", "prepare", "inbox"]);
  assert.deepEqual(dashboard.columns.find((column) => column.id === "deadline").taskIds, []);
});

test("reserves legacy deadline tag for the smart deadline column", () => {
  const config = normalizeConfig({
    dashboards: [
      {
        columns: [
          { id: "custom", name: "Custom", type: "manual", categoryTag: "#deadline", layoutGroup: "secondary" },
          { id: "deadline", name: "Deadline", type: "smart", smartType: "deadline", layoutGroup: "primary" }
        ]
      }
    ]
  });

  assert.equal(config.dashboards[0].columns.find((column) => column.id === "custom").categoryTag, "#deadline-2");
});

test("syncs dashboard config separately from runtime task order", () => {
  const config = normalizeConfig({
    dashboards: [
      {
        id: "main",
        name: "Task Board",
        today: { name: "Today", layoutGroup: "primary" },
        columns: [
          { id: "inbox", name: "Inbox", categoryTag: "#inbox", layoutGroup: "secondary" }
        ]
      }
    ]
  });
  const data = normalizeData({}, config);
  const dashboard = {
    id: "main",
    name: "Task Board",
    today: { name: "Today", layoutGroup: "primary", taskIds: ["task-a"] },
    columns: [
      { id: "inbox", name: "Inbox", categoryTag: "#inbox", layoutGroup: "primary", taskIds: ["task-b"] }
    ]
  };

  syncConfigDataFromDashboard(config, data, dashboard);

  assert.deepEqual(config.dashboards[0].columns, [
    { id: "inbox", name: "Inbox", type: "manual", categoryTag: "#inbox", layoutGroup: "primary" }
  ]);
  assert.deepEqual(data.dashboards[0].today.taskIds, ["task-a"]);
  assert.deepEqual(data.dashboards[0].columnTaskIds, { inbox: ["task-b"] });
});
