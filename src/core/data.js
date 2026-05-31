const { DEFAULT_DATA, cloneDefault } = require("./defaults");
const { getManualColumns, normalizeColumns, stripColumnState } = require("../columns/column-model");
const { clean, uniqueIds } = require("../utils/text");

function normalizeData(data, config) {
  const defaults = cloneDefault(DEFAULT_DATA);
  const configDashboard = config.dashboards[0];
  const sourceDashboard = Array.isArray(data?.dashboards) && data.dashboards.length > 0
    ? data.dashboards[0]
    : {};
  const legacyColumns = Array.isArray(sourceDashboard.columns) ? sourceDashboard.columns : [];
  const legacyTaskIds = {};
  for (const column of legacyColumns) {
    if (column?.id) legacyTaskIds[column.id] = uniqueIds(column.taskIds);
  }
  const sourceColumnTaskIds = Object.assign({}, legacyTaskIds, sourceDashboard.columnTaskIds || {});
  const columnTaskIds = {};
  for (const column of getManualColumns(configDashboard.columns)) {
    columnTaskIds[column.id] = uniqueIds(sourceColumnTaskIds[column.id]);
  }

  return {
    dataVersion: 1,
    dashboards: [
      {
        id: configDashboard.id,
        today: {
          taskIds: uniqueIds(sourceDashboard.today?.taskIds)
        },
        columnTaskIds
      }
    ],
    selectedTaskId: clean(data?.selectedTaskId || defaults.selectedTaskId)
  };
}

function hydrateDashboard(config, data) {
  const configDashboard = config.dashboards[0];
  const dataDashboard = data.dashboards[0];
  const hydratedColumns = configDashboard.columns.map((column) => ({
    ...column,
    taskIds: uniqueIds(dataDashboard.columnTaskIds?.[column.id])
  }));
  return {
    id: configDashboard.id,
    name: configDashboard.name,
    today: {
      name: configDashboard.today.name,
      layoutGroup: configDashboard.today.layoutGroup,
      taskIds: uniqueIds(dataDashboard.today?.taskIds)
    },
    columns: normalizeColumns(hydratedColumns, configDashboard.columns)
  };
}

function syncConfigDataFromDashboard(config, data, dashboard) {
  const columns = normalizeColumns(dashboard.columns, config.dashboards[0].columns);
  config.dashboards[0] = {
    id: clean(dashboard.id) || config.dashboards[0].id,
    name: clean(dashboard.name) || config.dashboards[0].name,
    today: {
      name: clean(dashboard.today?.name) || config.dashboards[0].today.name,
      layoutGroup: dashboard.today?.layoutGroup === "secondary" ? "secondary" : "primary"
    },
    columns: columns.map(stripColumnState)
  };
  data.dashboards[0] = {
    id: config.dashboards[0].id,
    today: {
      taskIds: uniqueIds(dashboard.today?.taskIds)
    },
    columnTaskIds: Object.fromEntries(getManualColumns(columns).map((column) => [column.id, uniqueIds(column.taskIds)]))
  };
}

module.exports = {
  normalizeData,
  hydrateDashboard,
  syncConfigDataFromDashboard
};
