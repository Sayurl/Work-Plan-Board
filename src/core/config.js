const { DEFAULT_CONFIG, cloneDefault } = require("./defaults");
const { normalizeColumns, stripColumnState } = require("../columns/column-model");
const { clean } = require("../utils/text");

const CONFIG_FILE = "config.json";

async function loadConfig(plugin, legacyData) {
  const stored = await readPluginJson(plugin, CONFIG_FILE);
  const config = stored || migrateConfigFromLegacyData(legacyData);
  const normalized = normalizeConfig(config);
  if (!stored) await saveConfig(plugin, normalized);
  return normalized;
}

async function saveConfig(plugin, config) {
  await writePluginJson(plugin, CONFIG_FILE, normalizeConfig(config));
}

function normalizeConfig(config) {
  const defaults = cloneDefault(DEFAULT_CONFIG);
  const source = Object.assign({}, defaults, config || {});
  const sourceDashboard = Array.isArray(source.dashboards) && source.dashboards.length > 0
    ? source.dashboards[0]
    : defaults.dashboards[0];
  const defaultDashboard = defaults.dashboards[0];
  const columns = normalizeColumns(
    Array.isArray(sourceDashboard.columns) ? sourceDashboard.columns : [],
    defaultDashboard.columns
  ).map(stripColumnState);

  return {
    configVersion: 1,
    dashboards: [
      {
        id: clean(sourceDashboard.id) || defaultDashboard.id,
        name: clean(sourceDashboard.name) || defaultDashboard.name,
        today: {
          name: clean(sourceDashboard.today?.name) || defaultDashboard.today.name,
          layoutGroup: sourceDashboard.today?.layoutGroup === "secondary" ? "secondary" : "primary"
        },
        columns
      }
    ],
    settings: Object.assign({}, defaults.settings, source.settings || {}),
    timelineSettings: Object.assign({}, defaults.timelineSettings, source.timelineSettings || {})
  };
}

function migrateConfigFromLegacyData(data) {
  const defaults = cloneDefault(DEFAULT_CONFIG);
  const dashboard = Array.isArray(data?.dashboards) && data.dashboards.length > 0
    ? data.dashboards[0]
    : defaults.dashboards[0];
  return {
    configVersion: 1,
    dashboards: [
      {
        id: clean(dashboard.id) || defaults.dashboards[0].id,
        name: clean(dashboard.name) || defaults.dashboards[0].name,
        today: {
          name: clean(dashboard.today?.name) || defaults.dashboards[0].today.name,
          layoutGroup: dashboard.today?.layoutGroup === "secondary" ? "secondary" : "primary"
        },
        columns: normalizeColumns(
          Array.isArray(dashboard.columns) ? dashboard.columns : [],
          defaults.dashboards[0].columns
        ).map(stripColumnState)
      }
    ],
    settings: Object.assign({}, defaults.settings, data?.settings || {}),
    timelineSettings: defaults.timelineSettings
  };
}

async function readPluginJson(plugin, fileName) {
  const path = getPluginFilePath(plugin, fileName);
  try {
    if (!(await plugin.app.vault.adapter.exists(path))) return null;
    const content = await plugin.app.vault.adapter.read(path);
    if (!content.trim()) return null;
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to parse ${fileName}`, error);
      return cloneDefault(DEFAULT_CONFIG);
    }
  } catch (error) {
    console.error(`Failed to read ${fileName}`, error);
    return cloneDefault(DEFAULT_CONFIG);
  }
}

async function writePluginJson(plugin, fileName, value) {
  const path = getPluginFilePath(plugin, fileName);
  await plugin.app.vault.adapter.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function getPluginFilePath(plugin, fileName) {
  const dir = plugin.manifest.dir || `.obsidian/plugins/${plugin.manifest.id}`;
  return `${dir}/${fileName}`;
}

module.exports = {
  CONFIG_FILE,
  loadConfig,
  saveConfig,
  normalizeConfig,
  migrateConfigFromLegacyData
};
