const { Notice, Plugin, TFile, TFolder } = require("obsidian");
const { BOARD_VIEW, SCHEDULE_VIEW, SIDEBAR_VIEW } = require("./core/constants");
const { DEFAULT_CONFIG } = require("./core/defaults");
const { loadConfig, saveConfig } = require("./core/config");
const { hydrateDashboard, normalizeData, syncConfigDataFromDashboard } = require("./core/data");
const { reconcileDashboard } = require("./core/reconcile");
const { getManualColumns, isManualColumn, isSmartColumn, normalizeColumns } = require("./columns/column-model");
const { moveColumnInList, moveColumnToGroupEnd: moveColumnToGroupEndInList, moveColumnToTarget } = require("./columns/column-service");
const { normalizeRelation } = require("./planning/task-time-link-model");
const { getTimeBlocksForDate, makeTimeBlockId, normalizeTimeBlock, todayString } = require("./planning/time-block-model");
const { TaskBoardSettingTab } = require("./settings/setting-tab");
const { appendTask, processCompletedTasks, reconcileInvalidTaskCategories, scanTasks, writeTask } = require("./tasks/task-repository");
const { addTaskToToday, removeTaskFromToday, reorderTaskList: reorderTaskIds } = require("./today/today-service");
const { BoardView } = require("./views/workboard-view");
const { ScheduleView } = require("./views/schedule-view");
const { SidebarView } = require("./views/sidebar-view");
const { clean, makeColumnId, makeTaskId, normalizeTag } = require("./utils/text");
const { getProjectRoot, normalizeSourceInput, parseWikiTarget } = require("./utils/source-links");

module.exports = class ProjectTaskBoardPlugin extends Plugin {
  async onload() {
    const legacyData = await this.loadData();
    this.config = await loadConfig(this, legacyData);
    this.data = normalizeData(legacyData, this.config);
    this.board = hydrateDashboard(this.config, this.data);
    this.tasks = [];
    this.tasksById = new Map();
    this.selectedTaskId = this.data.selectedTaskId || null;
    this.activeTaskId = null;
    this.expandedTaskId = null;
    this.refreshPromise = null;

    await this.savePluginData();

    this.registerView(BOARD_VIEW, (leaf) => new BoardView(leaf, this));
    this.registerView(SCHEDULE_VIEW, (leaf) => new ScheduleView(leaf, this));
    this.registerView(SIDEBAR_VIEW, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Open project task board", () => this.openBoard());
    this.addCommand({
      id: "open-project-task-board",
      name: "Open project task board",
      callback: () => this.openBoard()
    });
    this.addCommand({
      id: "open-work-plan-schedule-board",
      name: "Open schedule board",
      callback: () => this.openScheduleBoard()
    });
    this.addCommand({
      id: "open-project-task-sidebar",
      name: "Open project task sidebar",
      callback: () => this.openSidebar()
    });
    this.addSettingTab(new TaskBoardSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.refreshTasks();
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(BOARD_VIEW);
    this.app.workspace.detachLeavesOfType(SCHEDULE_VIEW);
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW);
  }

  get dashboard() {
    return this.board;
  }

  async savePluginData() {
    this.data.selectedTaskId = this.selectedTaskId || "";
    syncConfigDataFromDashboard(this.config, this.data, this.board);
    await saveConfig(this, this.config);
    await this.saveData(this.data);
  }

  async openBoard() {
    let leaf = this.app.workspace.getLeavesOfType(BOARD_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: BOARD_VIEW, active: true });
    }
    await this.openSidebar();
    this.app.workspace.revealLeaf(leaf);
  }

  async openScheduleBoard() {
    let leaf = this.app.workspace.getLeavesOfType(SCHEDULE_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: SCHEDULE_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async openSidebar() {
    let leaf = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: SIDEBAR_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async refreshTasks() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      await processCompletedTasks(this.app, this.dashboard.columns, this.config.settings.completedTaskPolicy || "keep");
      await reconcileInvalidTaskCategories(this.app, this.dashboard.columns);
      const parsed = await scanTasks(this.app, this.dashboard.columns);
      this.tasks = parsed.tasks;
      this.tasksById = new Map(this.tasks.map((task) => [task.id, task]));
      if (this.activeTaskId && !this.tasksById.has(this.activeTaskId)) this.activeTaskId = null;
      if (this.expandedTaskId && !this.tasksById.has(this.expandedTaskId)) this.expandedTaskId = null;
      reconcileDashboard(this.dashboard, this.tasks);
      await this.savePluginData();
      this.renderViews();
    })();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  renderViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(BOARD_VIEW)) {
      leaf.view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(SCHEDULE_VIEW)) {
      leaf.view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)) {
      leaf.view.render();
    }
  }

  selectTask(taskId) {
    this.selectedTaskId = taskId;
    this.savePluginData().catch((error) => console.error("Failed to save selected task", error));
    this.openSidebar();
    this.renderViews();
  }

  getTask(taskId) {
    return this.tasksById.get(taskId);
  }

  getActiveTask() {
    return this.activeTaskId ? this.getTask(this.activeTaskId) : null;
  }

  toggleTaskDetails(taskId) {
    if (!this.tasksById.has(taskId)) return;
    this.activeTaskId = taskId;
    this.expandedTaskId = this.expandedTaskId === taskId ? null : taskId;
    this.renderViews();
  }

  getTasksForColumn(columnId) {
    const column = this.dashboard.columns.find((item) => item.id === columnId);
    if (!column) return [];
    return column.taskIds.map((id) => this.getTask(id)).filter(Boolean);
  }

  getTodayTasks() {
    return this.dashboard.today.taskIds.map((id) => this.getTask(id)).filter(Boolean);
  }

  getTodayDate() {
    return todayString();
  }

  getTodayTimeBlocks() {
    return getTimeBlocksForDate(this.dashboard.timeBlocks, this.getTodayDate());
  }

  getTimeBlocksForDate(date) {
    return getTimeBlocksForDate(this.dashboard.timeBlocks, date || this.getTodayDate());
  }

  getTimeBlock(timeBlockId) {
    return (this.dashboard.timeBlocks || []).find((block) => block.id === timeBlockId);
  }

  getTaskTimeLinks(timeBlockId) {
    return (this.dashboard.taskTimeLinks || []).filter((link) => link.timeBlockId === timeBlockId);
  }

  getLinkedTasksForTimeBlock(timeBlockId) {
    return this.getTaskTimeLinks(timeBlockId)
      .map((link) => ({ link, task: this.getTask(link.taskId) }))
      .filter((item) => item.task);
  }

  getTaskOptions() {
    return this.tasks
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((task) => ({ id: task.id, name: task.title }));
  }

  async addToToday(taskId) {
    if (!this.tasksById.has(taskId)) return;
    if (!this.dashboard.today.taskIds.includes(taskId)) {
      addTaskToToday(this.dashboard.today, taskId);
      await this.savePluginData();
      this.renderViews();
    }
  }

  async removeFromToday(taskId) {
    removeTaskFromToday(this.dashboard.today, taskId);
    await this.savePluginData();
    this.renderViews();
  }

  async reorderTaskList(list, taskId, targetId, placement = "before") {
    reorderTaskIds(list, taskId, targetId, placement);
    await this.savePluginData();
    this.renderViews();
  }

  async moveTaskToCategory(taskId, categoryId, targetId, placement = "before") {
    const task = this.getTask(taskId);
    if (!task || !this.getManualColumn(categoryId)) return;

    for (const column of this.getManualColumns()) {
      column.taskIds = column.taskIds.filter((id) => id !== taskId);
    }

    const targetColumn = this.getManualColumn(categoryId);
    if (targetColumn) {
      const target = targetId ? targetColumn.taskIds.indexOf(targetId) : -1;
      if (target >= 0) targetColumn.taskIds.splice(placement === "after" ? target + 1 : target, 0, taskId);
      else targetColumn.taskIds.push(taskId);
    }

    task.category = categoryId;
    await this.writeTask(task);
    await this.savePluginData();
    this.renderViews();
  }

  async completeTask(taskId, completed) {
    const task = this.getTask(taskId);
    if (!task) return;
    task.completed = completed;
    await this.writeTask(task);
    this.renderViews();
  }

  async createTask(input) {
    const task = {
      id: makeTaskId(),
      title: input.title.trim(),
      completed: false,
      category: input.category || "inbox",
      project: clean(input.project),
      dueDate: clean(input.dueDate),
      estimate: clean(input.estimate),
      source: clean(input.source),
      nextAction: clean(input.nextAction),
      waitingFor: clean(input.waitingFor),
      followUpDate: clean(input.followUpDate),
      goal: clean(input.goal),
      comment: clean(input.comment),
      filePath: await this.resolveTaskFilePath(input)
    };

    if (!task.title || !this.getManualColumn(task.category)) {
      new Notice("Task title and category are required.");
      return null;
    }

    await this.appendTask(task);
    const column = this.getManualColumn(task.category);
    if (column && !column.taskIds.includes(task.id)) column.taskIds.push(task.id);
    await this.savePluginData();
    await this.refreshTasks();
    return task;
  }

  async updateTask(taskId, input) {
    const task = this.getTask(taskId);
    if (!task) return;
    const oldCategory = task.category;

    task.title = input.title.trim();
    task.category = input.category;
    task.project = clean(input.project);
    task.dueDate = clean(input.dueDate);
    task.estimate = clean(input.estimate);
    task.source = clean(input.source);
    task.nextAction = clean(input.nextAction);
    task.waitingFor = clean(input.waitingFor);
    task.followUpDate = clean(input.followUpDate);
    task.goal = clean(input.goal);
    task.comment = clean(input.comment);

    if (!task.title || !this.getManualColumn(task.category)) {
      new Notice("Task title and category are required.");
      return;
    }

    await this.writeTask(task);
    if (oldCategory !== task.category) {
      for (const column of this.getManualColumns()) {
        column.taskIds = column.taskIds.filter((id) => id !== task.id);
      }
      const column = this.getManualColumn(task.category);
      if (column) column.taskIds.push(task.id);
      await this.savePluginData();
    }
    await this.refreshTasks();
  }

  async createTimeBlock(input) {
    this.dashboard.timeBlocks = Array.isArray(this.dashboard.timeBlocks) ? this.dashboard.timeBlocks : [];
    const block = normalizeTimeBlock({
      id: makeTimeBlockId(),
      title: input.title,
      date: input.date || this.getTodayDate(),
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      notes: input.notes
    });
    this.dashboard.timeBlocks.push(block);
    await this.savePluginData();
    this.renderViews();
    return block;
  }

  async updateTimeBlock(timeBlockId, input) {
    const block = this.getTimeBlock(timeBlockId);
    if (!block) return null;
    const usedIds = new Set(this.dashboard.timeBlocks.filter((item) => item.id !== timeBlockId).map((item) => item.id));
    Object.assign(block, normalizeTimeBlock({
      ...block,
      title: input.title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      notes: input.notes
    }, usedIds));
    await this.savePluginData();
    this.renderViews();
    return block;
  }

  async deleteTimeBlock(timeBlockId) {
    this.dashboard.timeBlocks = Array.isArray(this.dashboard.timeBlocks) ? this.dashboard.timeBlocks : [];
    this.dashboard.taskTimeLinks = Array.isArray(this.dashboard.taskTimeLinks) ? this.dashboard.taskTimeLinks : [];
    this.dashboard.timeBlocks = this.dashboard.timeBlocks.filter((block) => block.id !== timeBlockId);
    this.dashboard.taskTimeLinks = this.dashboard.taskTimeLinks.filter((link) => link.timeBlockId !== timeBlockId);
    await this.savePluginData();
    this.renderViews();
  }

  async linkTaskToTimeBlock(taskId, timeBlockId, relation = "related") {
    if (!this.tasksById.has(taskId) || !this.getTimeBlock(timeBlockId)) return;
    this.dashboard.taskTimeLinks = Array.isArray(this.dashboard.taskTimeLinks) ? this.dashboard.taskTimeLinks : [];
    const existing = this.dashboard.taskTimeLinks.find((link) => link.taskId === taskId && link.timeBlockId === timeBlockId);
    if (existing) {
      existing.relation = normalizeRelation(relation);
    } else {
      this.dashboard.taskTimeLinks.push({
        taskId,
        timeBlockId,
        relation: normalizeRelation(relation),
        syncDate: false
      });
    }
    await this.savePluginData();
    this.renderViews();
  }

  async unlinkTaskFromTimeBlock(taskId, timeBlockId) {
    this.dashboard.taskTimeLinks = Array.isArray(this.dashboard.taskTimeLinks) ? this.dashboard.taskTimeLinks : [];
    this.dashboard.taskTimeLinks = this.dashboard.taskTimeLinks.filter((link) => !(link.taskId === taskId && link.timeBlockId === timeBlockId));
    await this.savePluginData();
    this.renderViews();
  }

  async resolveTaskFilePath(input) {
    const selectedFolder = clean(input.project);
    if (selectedFolder) return `${selectedFolder}/_Tasks.md`;
    const active = this.app.workspace.getActiveFile();
    if (input.useSource && active) {
      const projectRoot = getProjectRoot(active.path);
      if (projectRoot) return `${projectRoot}/_Tasks.md`;
    }
    return "_Tasks.md";
  }

  getActiveSourceLink() {
    const active = this.app.workspace.getActiveFile();
    if (!active) return "";
    const pathWithoutExt = active.path.replace(/\.md$/i, "");
    return pathWithoutExt;
  }

  getFolderOptions() {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((item) => item instanceof TFolder)
      .map((folder) => folder.path)
      .filter((path) => path && !path.startsWith(".obsidian"))
      .sort((a, b) => a.localeCompare(b));
  }

  getSourceOptions() {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => !file.path.startsWith(".obsidian/"))
      .map((file) => file.path.replace(/\.md$/i, ""))
      .sort((a, b) => a.localeCompare(b));
  }

  getColumn(columnId) {
    return this.dashboard.columns.find((column) => column.id === columnId);
  }

  getManualColumn(columnId) {
    return getManualColumns(this.dashboard.columns).find((column) => column.id === columnId);
  }

  getManualColumns() {
    return getManualColumns(this.dashboard.columns);
  }

  getColumnOptions(excludeId = "") {
    return this.getManualColumns()
      .filter((column) => column.id !== excludeId)
      .map((column) => ({ id: column.id, name: column.name }));
  }

  async updateColumns(columns) {
    this.dashboard.columns = normalizeColumns(columns);
    await this.savePluginData();
    await this.refreshTasks();
  }

  async addColumnFromBoard(layoutGroup = "secondary") {
    const columns = this.dashboard.columns.slice();
    const baseName = "New Column";
    const id = makeColumnId(baseName, columns);
    columns.push({
      id,
      name: baseName,
      type: "manual",
      categoryTag: `#${id}`,
      layoutGroup,
      taskIds: []
    });
    await this.updateColumns(columns);
  }

  async moveColumn(columnId, direction) {
    await this.updateColumns(moveColumnInList(this.dashboard.columns, columnId, direction));
  }

  async moveColumnTo(columnId, targetId, layoutGroup, placement = "before") {
    await this.updateColumns(moveColumnToTarget(this.dashboard.columns, columnId, targetId, layoutGroup, placement));
  }

  async moveColumnToGroupEnd(columnId, layoutGroup) {
    await this.updateColumns(moveColumnToGroupEndInList(this.dashboard.columns, columnId, layoutGroup));
  }

  async updateColumnLayout(columnId, layoutGroup) {
    const column = this.getColumn(columnId);
    if (!column) return;
    column.layoutGroup = layoutGroup === "primary" ? "primary" : "secondary";
    await this.updateColumns(this.dashboard.columns);
  }

  async renameColumn(columnId, name) {
    const column = this.getColumn(columnId);
    if (!column) return;
    column.name = clean(name) || column.name;
    await this.updateColumns(this.dashboard.columns);
  }

  async updateColumnTag(columnId, categoryTag) {
    const column = this.getColumn(columnId);
    if (!column || !isManualColumn(column)) return;
    column.categoryTag = normalizeTag(categoryTag) || column.categoryTag;
    this.dashboard.columns = normalizeColumns(this.dashboard.columns);
    const tasks = this.tasks.filter((task) => task.category === columnId);
    for (const task of tasks) {
      await this.writeTask(task);
    }
    await this.savePluginData();
    await this.refreshTasks();
  }

  async resetColumnsToDefault() {
    const defaultColumns = normalizeColumns(DEFAULT_CONFIG.dashboards[0].columns);
    const defaultManualColumns = getManualColumns(defaultColumns);
    const defaultManualIds = new Set(defaultManualColumns.map((column) => column.id));
    const defaultInbox = defaultManualColumns.find((column) => column.id === "inbox") || defaultManualColumns[0];
    const tasksToMove = this.tasks.filter((task) => !defaultManualIds.has(task.category));
    this.dashboard.columns = defaultColumns;
    for (const task of tasksToMove) {
      task.category = defaultInbox.id;
      await this.writeTask(task);
    }
    await this.savePluginData();
    await this.refreshTasks();
  }

  async migrateColumnTasks(sourceId, targetId) {
    if (sourceId === targetId) return;
    const source = this.getColumn(sourceId);
    const target = this.getManualColumn(targetId);
    if (!source || !isManualColumn(source) || !target) return;
    const tasks = this.tasks.filter((task) => task.category === sourceId);
    for (const task of tasks) {
      task.category = targetId;
      await this.writeTask(task);
    }
  }

  async deleteColumn(sourceId, targetId) {
    const source = this.getColumn(sourceId);
    if (!source) return;
    if (isManualColumn(source) && this.getManualColumns().length <= 1) {
      new Notice("At least one column is required.");
      return;
    }
    if (isManualColumn(source)) await this.migrateColumnTasks(sourceId, targetId);
    if (isSmartColumn(source) && this.dashboard.columns.length <= 1) {
      new Notice("At least one column is required.");
      return;
    }
    this.dashboard.columns = this.dashboard.columns.filter((column) => column.id !== sourceId);
    this.dashboard.today.taskIds = this.dashboard.today.taskIds.filter((id) => this.tasksById.has(id));
    await this.savePluginData();
    await this.refreshTasks();
  }

  async appendTask(task) {
    await appendTask(this.app, task, this.dashboard.columns);
  }

  async writeTask(task) {
    await writeTask(this.app, task, this.dashboard.columns);
  }

  async openSource(task) {
    const target = parseWikiTarget(task.source);
    if (!target) return;
    const file = this.app.metadataCache.getFirstLinkpathDest(target, task.filePath);
    if (file) {
      await this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice("Source note was not found.");
    }
  }

  async openTaskFile(task) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
};
