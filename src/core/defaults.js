const { CATEGORY_COLUMNS } = require("./constants");

const DEFAULT_CONFIG = {
  configVersion: 1,
  dashboards: [
    {
      id: "main",
      name: "Task Board",
      today: {
        name: "Today",
        layoutGroup: "primary"
      },
      columns: CATEGORY_COLUMNS.map((column) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        ...(column.type === "smart"
          ? { smartType: column.smartType }
          : { categoryTag: column.tag }),
        layoutGroup: column.group
      }))
    }
  ],
  settings: {
    completedTaskPolicy: "keep"
  },
  timelineSettings: {
    startTime: "09:00",
    endTime: "18:00",
    slotMinutes: 15,
    slotHeight: 36
  }
};

const DEFAULT_DATA = {
  dataVersion: 1,
  dashboards: [
    {
      id: "main",
      today: {
        taskIds: []
      },
      columnTaskIds: {},
      timeBlocks: [],
      taskTimeLinks: []
    }
  ],
  selectedTaskId: ""
};

function cloneDefault(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_DATA,
  cloneDefault
};
