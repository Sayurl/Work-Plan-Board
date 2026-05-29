const {
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf
} = require("obsidian");

const BOARD_VIEW = "project-task-board-view";
const SIDEBAR_VIEW = "project-task-board-sidebar";

const CATEGORY_COLUMNS = [
  { id: "inbox", name: "Inbox", tag: "#inbox", group: "secondary" },
  { id: "this-week", name: "This Week", tag: "#this-week", group: "secondary" },
  { id: "deadline", name: "Deadline", tag: "#deadline", group: "primary" },
  { id: "prepare", name: "Prepare", tag: "#prepare", group: "secondary" },
  { id: "waiting", name: "Waiting", tag: "#waiting", group: "primary" },
  { id: "backlog", name: "Backlog", tag: "#backlog", group: "secondary" }
];

const CATEGORY_IDS = new Set(CATEGORY_COLUMNS.map((column) => column.id));
const CATEGORY_TAGS = new Map(CATEGORY_COLUMNS.map((column) => [column.tag, column.id]));
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

const DEFAULT_DATA = {
  dashboards: [
    {
      id: "main",
      name: "Task Board",
      today: {
        name: "Today",
        layoutGroup: "primary",
        taskIds: []
      },
      columns: CATEGORY_COLUMNS.map((column) => ({
        id: column.id,
        name: column.name,
        categoryTag: column.tag,
        layoutGroup: column.group,
        taskIds: []
      }))
    }
  ],
  settings: {
    completedTaskPolicy: "keep"
  }
};

module.exports = class ProjectTaskBoardPlugin extends Plugin {
  async onload() {
    this.data = normalizeData(await this.loadData());
    this.tasks = [];
    this.tasksById = new Map();
    this.selectedTaskId = null;
    this.refreshPromise = null;

    this.registerView(BOARD_VIEW, (leaf) => new BoardView(leaf, this));
    this.registerView(SIDEBAR_VIEW, (leaf) => new SidebarView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Open project task board", () => this.openBoard());
    this.addCommand({
      id: "open-project-task-board",
      name: "Open project task board",
      callback: () => this.openBoard()
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
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW);
  }

  get dashboard() {
    return this.data.dashboards[0];
  }

  async savePluginData() {
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
      await this.processCompletedTasks();
      const parsed = await this.scanTasks();
      this.tasks = parsed.tasks;
      this.tasksById = new Map(this.tasks.map((task) => [task.id, task]));
      this.reconcileDashboard();
      await this.savePluginData();
      this.renderViews();
    })();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async scanTasks() {
    const taskFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.name === "_Tasks.md");
    const tasks = [];
    const seen = new Set();

    for (const file of taskFiles) {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!/^- \[[ xX]\] /.test(line)) continue;

        let end = index + 1;
        while (end < lines.length && !/^- \[[ xX]\] /.test(lines[end])) {
          end += 1;
        }

        const task = parseTaskBlock(file.path, lines.slice(index, end), index, end);
        if (!task || task.completed || seen.has(task.id)) {
          index = end - 1;
          continue;
        }
        seen.add(task.id);
        tasks.push(task);
        index = end - 1;
      }
    }

    return { tasks };
  }

  async processCompletedTasks() {
    const policy = this.data.settings.completedTaskPolicy || "keep";
    if (policy === "keep") return;

    const taskFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.name === "_Tasks.md");

    for (const file of taskFiles) {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      const removals = [];
      const archiveBlocks = [];

      for (let index = 0; index < lines.length; index += 1) {
        if (!/^- \[[xX]\] /.test(lines[index])) continue;
        let end = index + 1;
        while (end < lines.length && !/^- \[[ xX]\] /.test(lines[end])) {
          end += 1;
        }
        const task = parseTaskBlock(file.path, lines.slice(index, end), index, end);
        if (task && task.completed) {
          removals.push({ start: index, end });
          archiveBlocks.push(lines.slice(index, end).join("\n"));
        }
        index = end - 1;
      }

      if (removals.length === 0) continue;

      if (policy === "archive") {
        const donePath = file.path.split("/").slice(0, -1).concat("_Done.md").join("/") || "_Done.md";
        await ensureFile(this.app, donePath);
        const doneFile = this.app.vault.getAbstractFileByPath(donePath);
        const doneContent = await this.app.vault.read(doneFile);
        const archiveText = archiveBlocks.join("\n\n");
        const nextDone = doneContent.trim().length > 0
          ? `${doneContent.replace(/\s*$/, "\n\n")}${archiveText}\n`
          : `${archiveText}\n`;
        await this.app.vault.modify(doneFile, nextDone);
      }

      for (const removal of removals.reverse()) {
        lines.splice(removal.start, removal.end - removal.start);
        if (lines[removal.start] === "") lines.splice(removal.start, 1);
      }
      await this.app.vault.modify(file, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
    }
  }

  reconcileDashboard() {
    const ids = new Set(this.tasks.map((task) => task.id));
    const byCategory = new Map();
    for (const task of this.tasks) {
      if (!byCategory.has(task.category)) byCategory.set(task.category, []);
      byCategory.get(task.category).push(task.id);
    }

    this.dashboard.today.taskIds = uniqueIds(this.dashboard.today.taskIds).filter((id) => ids.has(id));

    for (const columnDef of CATEGORY_COLUMNS) {
      let column = this.dashboard.columns.find((item) => item.id === columnDef.id);
      if (!column) {
        column = {
          id: columnDef.id,
          name: columnDef.name,
          categoryTag: columnDef.tag,
          layoutGroup: columnDef.group,
          taskIds: []
        };
        this.dashboard.columns.push(column);
      }
      column.name = columnDef.name;
      column.categoryTag = columnDef.tag;
      column.layoutGroup = column.layoutGroup || columnDef.group;

      const categoryIds = byCategory.get(column.id) || [];
      const existing = uniqueIds(column.taskIds).filter((id) => categoryIds.includes(id));
      const missing = categoryIds.filter((id) => !existing.includes(id));
      column.taskIds = existing.concat(missing);
    }
  }

  renderViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(BOARD_VIEW)) {
      leaf.view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)) {
      leaf.view.render();
    }
  }

  selectTask(taskId) {
    this.selectedTaskId = taskId;
    this.openSidebar();
    this.renderViews();
  }

  getTask(taskId) {
    return this.tasksById.get(taskId);
  }

  getTasksForColumn(columnId) {
    const column = this.dashboard.columns.find((item) => item.id === columnId);
    if (!column) return [];
    return column.taskIds.map((id) => this.getTask(id)).filter(Boolean);
  }

  getTodayTasks() {
    return this.dashboard.today.taskIds.map((id) => this.getTask(id)).filter(Boolean);
  }

  async addToToday(taskId) {
    if (!this.tasksById.has(taskId)) return;
    if (!this.dashboard.today.taskIds.includes(taskId)) {
      this.dashboard.today.taskIds.push(taskId);
      await this.savePluginData();
      this.renderViews();
    }
  }

  async removeFromToday(taskId) {
    this.dashboard.today.taskIds = this.dashboard.today.taskIds.filter((id) => id !== taskId);
    await this.savePluginData();
    this.renderViews();
  }

  async reorderTaskList(list, taskId, targetId) {
    const current = list.indexOf(taskId);
    if (current >= 0) list.splice(current, 1);
    const target = targetId ? list.indexOf(targetId) : -1;
    if (target >= 0) list.splice(target, 0, taskId);
    else list.push(taskId);
    await this.savePluginData();
    this.renderViews();
  }

  async moveTaskToCategory(taskId, categoryId, targetId) {
    const task = this.getTask(taskId);
    if (!task || !CATEGORY_IDS.has(categoryId)) return;

    for (const column of this.dashboard.columns) {
      column.taskIds = column.taskIds.filter((id) => id !== taskId);
    }

    const targetColumn = this.dashboard.columns.find((column) => column.id === categoryId);
    if (targetColumn) {
      const target = targetId ? targetColumn.taskIds.indexOf(targetId) : -1;
      if (target >= 0) targetColumn.taskIds.splice(target, 0, taskId);
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

    if (!task.title || !CATEGORY_IDS.has(task.category)) {
      new Notice("Task title and category are required.");
      return null;
    }

    await this.appendTask(task);
    const column = this.dashboard.columns.find((item) => item.id === task.category);
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

    if (!task.title || !CATEGORY_IDS.has(task.category)) {
      new Notice("Task title and category are required.");
      return;
    }

    await this.writeTask(task);
    if (oldCategory !== task.category) {
      for (const column of this.dashboard.columns) {
        column.taskIds = column.taskIds.filter((id) => id !== task.id);
      }
      const column = this.dashboard.columns.find((item) => item.id === task.category);
      if (column) column.taskIds.push(task.id);
      await this.savePluginData();
    }
    await this.refreshTasks();
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

  async appendTask(task) {
    await ensureFile(this.app, task.filePath);
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    const content = await this.app.vault.read(file);
    const addition = renderTaskMarkdown(task);
    const nextContent = content.trim().length > 0
      ? `${content.replace(/\s*$/, "\n\n")}${addition}\n`
      : `${addition}\n`;
    await this.app.vault.modify(file, nextContent);
  }

  async writeTask(task) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${task.filePath}`);
      return;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const replacement = renderTaskMarkdown(task).split("\n");
    lines.splice(task.lineStart, task.lineEnd - task.lineStart, ...replacement);
    await this.app.vault.modify(file, lines.join("\n"));
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

class BoardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return BOARD_VIEW;
  }

  getDisplayText() {
    return "Work Plan Board";
  }

  async onOpen() {
    await this.plugin.refreshTasks();
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ptb-view");

    const toolbar = container.createDiv("ptb-toolbar");
    toolbar.createEl("h2", { text: "Task Board" });
    const actions = toolbar.createDiv("ptb-toolbar-actions");
    actions.createEl("button", { text: "Refresh" }).onclick = () => this.plugin.refreshTasks();
    actions.createEl("button", { text: "New Task" }).onclick = () => {
      this.plugin.selectedTaskId = null;
      this.plugin.openSidebar();
      for (const leaf of this.plugin.app.workspace.getLeavesOfType(SIDEBAR_VIEW)) {
        leaf.view.mode = "create";
        leaf.view.render();
      }
    };

    const primary = container.createDiv("ptb-board-section ptb-primary");
    this.renderToday(primary);
    const thisWeek = this.plugin.dashboard.columns.find((item) => item.id === "this-week");
    if (thisWeek) this.renderColumn(primary, thisWeek);

    const secondary = container.createDiv("ptb-board-section ptb-secondary");
    for (const column of this.plugin.dashboard.columns.filter((item) => item.id !== "this-week")) {
      this.renderColumn(secondary, column);
    }
  }

  renderToday(parent) {
    const columnEl = parent.createDiv("ptb-column ptb-today");
    const header = columnEl.createDiv("ptb-column-header");
    header.createEl("h3", { text: "Today" });
    header.createSpan({ text: String(this.plugin.getTodayTasks().length), cls: "ptb-count" });
    const list = columnEl.createDiv("ptb-card-list");
    list.dataset.list = "today";
    makeDropZone(list, async (taskId, targetId) => {
      await this.plugin.addToToday(taskId);
      await this.plugin.reorderTaskList(this.plugin.dashboard.today.taskIds, taskId, targetId);
    });
    for (const task of this.plugin.getTodayTasks()) {
      list.appendChild(renderTaskCard(this.plugin, task, { inToday: true }));
    }
  }

  renderColumn(parent, column) {
    const tasks = this.plugin.getTasksForColumn(column.id);
    const columnEl = parent.createDiv("ptb-column");
    const header = columnEl.createDiv("ptb-column-header");
    header.createEl("h3", { text: column.name });
    header.createSpan({ text: String(tasks.length), cls: "ptb-count" });
    const list = columnEl.createDiv("ptb-card-list");
    list.dataset.column = column.id;
    makeDropZone(list, async (taskId, targetId) => {
      const task = this.plugin.getTask(taskId);
      if (!task) return;
      if (task.category === column.id) {
        await this.plugin.reorderTaskList(column.taskIds, taskId, targetId);
      } else {
        await this.plugin.moveTaskToCategory(taskId, column.id, targetId);
      }
    });
    for (const task of tasks) {
      list.appendChild(renderTaskCard(this.plugin, task, { inToday: this.plugin.dashboard.today.taskIds.includes(task.id) }));
    }
  }
}

class SidebarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = "focus";
    this.focusIndex = 0;
  }

  getViewType() {
    return SIDEBAR_VIEW;
  }

  getDisplayText() {
    return "Task Board Sidebar";
  }

  async onOpen() {
    this.render();
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ptb-sidebar");

    const header = container.createDiv("ptb-sidebar-header");
    header.createEl("h3", { text: "Tasks" });
    const buttonRow = header.createDiv("ptb-sidebar-actions");
    buttonRow.createEl("button", { text: "Columns" }).onclick = () => {
      this.mode = "focus";
      this.plugin.selectedTaskId = null;
      this.render();
    };
    buttonRow.createEl("button", { text: "New" }).onclick = () => {
      this.mode = "create";
      this.plugin.selectedTaskId = null;
      this.render();
    };

    if (this.plugin.selectedTaskId) {
      this.mode = "edit";
    }

    if (this.mode === "create") this.renderCreate(container);
    else if (this.mode === "edit") this.renderEdit(container);
    else this.renderFocus(container);
  }

  renderFocus(container) {
    const focusItems = [
      { id: "today", name: "Today", type: "today" },
      ...this.plugin.dashboard.columns.map((column) => ({ ...column, type: "category" }))
    ];
    if (this.focusIndex >= focusItems.length) this.focusIndex = 0;
    const item = focusItems[this.focusIndex];
    const nav = container.createDiv("ptb-focus-nav");
    nav.createEl("button", { text: "<" }).onclick = () => {
      this.focusIndex = (this.focusIndex - 1 + focusItems.length) % focusItems.length;
      this.render();
    };
    nav.createEl("strong", { text: item.name });
    nav.createEl("button", { text: ">" }).onclick = () => {
      this.focusIndex = (this.focusIndex + 1) % focusItems.length;
      this.render();
    };
    const list = container.createDiv("ptb-focus-list");
    const tasks = item.type === "today" ? this.plugin.getTodayTasks() : this.plugin.getTasksForColumn(item.id);
    for (const task of tasks) {
      list.appendChild(renderTaskCard(this.plugin, task, { compact: true, inToday: this.plugin.dashboard.today.taskIds.includes(task.id) }));
    }
  }

  renderCreate(container) {
    const form = renderTaskForm(this.plugin, null);
    container.appendChild(form.el);
    form.onSave = async () => {
      await this.plugin.createTask(form.read());
      this.mode = "focus";
      this.render();
    };
    form.onCancel = () => {
      this.mode = "focus";
      this.render();
    };
  }

  renderEdit(container) {
    const task = this.plugin.getTask(this.plugin.selectedTaskId);
    if (!task) {
      this.plugin.selectedTaskId = null;
      this.mode = "focus";
      this.render();
      return;
    }
    const form = renderTaskForm(this.plugin, task);
    container.appendChild(form.el);
    form.onSave = async () => {
      await this.plugin.updateTask(task.id, form.read());
      this.plugin.selectedTaskId = null;
      this.mode = "focus";
      this.render();
    };
    form.onCancel = () => {
      this.plugin.selectedTaskId = null;
      this.mode = "focus";
      this.render();
    };
  }
}

class TaskBoardSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Work Plan Board" });

    new Setting(containerEl)
      .setName("Completed task policy")
      .setDesc("Applied when the board refreshes. Completed tasks remain visible until refresh so accidental completion can be undone.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("keep", "Keep in _Tasks.md")
          .addOption("archive", "Move to _Done.md on refresh")
          .addOption("delete", "Delete on refresh")
          .setValue(this.plugin.data.settings.completedTaskPolicy || "keep")
          .onChange(async (value) => {
            this.plugin.data.settings.completedTaskPolicy = value;
            await this.plugin.savePluginData();
          });
      });
  }
}

function renderTaskCard(plugin, task, options = {}) {
  const card = document.createElement("div");
  card.className = `ptb-card${task.completed ? " is-completed" : ""}`;
  card.draggable = true;
  card.dataset.taskId = task.id;

  card.ondragstart = (event) => {
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
  };
  card.ondragover = (event) => event.preventDefault();
  card.ondrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedId = event.dataTransfer.getData("text/plain");
    const list = card.parentElement;
    if (list) list.dispatchEvent(new CustomEvent("ptb-drop-task", { detail: { taskId: droppedId, targetId: task.id } }));
  };
  card.onclick = (event) => {
    if (event.target.closest("button") || event.target.closest("a") || event.target.closest("summary")) return;
    const details = card.querySelector(".ptb-details");
    if (details) details.open = !details.open;
  };

  const top = card.createDiv("ptb-card-top");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  top.appendChild(checkbox);
  checkbox.checked = task.completed;
  checkbox.onclick = async (event) => {
    event.stopPropagation();
    await plugin.completeTask(task.id, checkbox.checked);
  };
  top.createEl("div", { text: task.title, cls: "ptb-card-title" });

  const meta = card.createDiv("ptb-card-meta");
  meta.createSpan({ text: categoryName(task.category), cls: "ptb-chip" });
  if (task.project) meta.createSpan({ text: displayPathLabel(task.project), cls: "ptb-chip" });
  if (task.dueDate) meta.createSpan({ text: `Due ${task.dueDate}`, cls: "ptb-chip ptb-chip-due" });
  if (task.estimate) meta.createSpan({ text: task.estimate, cls: "ptb-chip" });
  if (task.waitingFor) meta.createSpan({ text: task.waitingFor, cls: "ptb-chip" });
  if (task.followUpDate) meta.createSpan({ text: `Check ${task.followUpDate}`, cls: "ptb-chip" });

  if (task.nextAction || task.goal || task.comment || task.source || options.compact) {
    const details = card.createEl("details", { cls: "ptb-details" });
    details.createEl("summary", { text: "Details" });
    if (task.nextAction) details.createEl("p", { text: `Next: ${task.nextAction}` });
    if (task.goal) details.createEl("p", { text: `Goal: ${task.goal}` });
    if (task.comment) details.createEl("p", { text: `Comment: ${task.comment}` });
    if (task.source) details.createEl("p", { text: `Source: ${displaySourceLabel(task.source)}` });
    if (!task.nextAction && !task.goal && !task.comment && !task.source) {
      details.createEl("p", { text: "No details yet." });
    }
  }

  const actions = card.createDiv("ptb-card-actions");
  const editButton = actions.createEl("button", { text: "Edit" });
  editButton.onclick = (event) => {
    event.stopPropagation();
    plugin.selectTask(task.id);
  };
  if (task.source) {
    const sourceButton = actions.createEl("button", { text: displaySourceLabel(task.source) || "Source" });
    sourceButton.addClass("ptb-source-button");
    sourceButton.onclick = (event) => {
      event.stopPropagation();
      plugin.openSource(task);
    };
  }
  if (options.inToday) {
    const remove = actions.createEl("button", { text: "Remove Today" });
    remove.onclick = (event) => {
      event.stopPropagation();
      plugin.removeFromToday(task.id);
    };
  } else {
    const add = actions.createEl("button", { text: "Add Today" });
    add.onclick = (event) => {
      event.stopPropagation();
      plugin.addToToday(task.id);
    };
  }
  const fileButton = actions.createEl("button", { text: "File" });
  fileButton.onclick = (event) => {
    event.stopPropagation();
    plugin.openTaskFile(task);
  };

  return card;
}

function makeDropZone(el, onDrop) {
  el.ondragover = (event) => event.preventDefault();
  el.ondrop = async (event) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) await onDrop(taskId, null);
  };
  el.addEventListener("ptb-drop-task", async (event) => {
    await onDrop(event.detail.taskId, event.detail.targetId);
  });
}

function renderTaskForm(plugin, task) {
  const el = document.createElement("div");
  el.className = "ptb-form";
  const formHeader = el.createDiv("ptb-form-sticky");
  formHeader.createEl("h4", { text: task ? "Edit Task" : "New Task" });
  const buttons = formHeader.createDiv("ptb-form-buttons");
  const save = buttons.createEl("button", { text: "Save" });
  const cancel = buttons.createEl("button", { text: "Cancel" });

  const fields = {};
  fields.title = field(el, "Task name", task ? task.title : "");
  fields.category = selectField(el, "Category", task ? task.category : "inbox");
  fields.project = searchField(el, "Project folder", task ? task.project : "", plugin.getFolderOptions(), {
    placeholder: "Type to search folders"
  });
  fields.dueDate = field(el, "Due date", task ? task.dueDate : "", "date");
  fields.estimate = field(el, "Estimate", task ? task.estimate : "");
  fields.source = searchField(el, "Source note", task ? sourceToInputValue(task.source) : "", plugin.getSourceOptions(), {
    placeholder: "Type to search notes"
  });
  if (!task) {
    const activeSource = plugin.getActiveSourceLink();
    const sourceRow = el.createDiv("ptb-form-row ptb-checkbox-row");
    const sourceCheck = document.createElement("input");
    sourceCheck.type = "checkbox";
    sourceRow.appendChild(sourceCheck);
    sourceCheck.checked = Boolean(activeSource);
    sourceRow.createEl("label", { text: "Use active note as source" });
    if (activeSource) fields.source.value = activeSource;
    sourceCheck.onchange = () => {
      fields.source.value = sourceCheck.checked ? activeSource : "";
    };
    fields.useSource = sourceCheck;
  }
  fields.nextAction = area(el, "Next action", task ? task.nextAction : "");
  fields.waitingFor = field(el, "Waiting for", task ? task.waitingFor : "");
  fields.followUpDate = field(el, "Follow-up date", task ? task.followUpDate : "", "date");
  fields.goal = area(el, "Goal", task ? task.goal : "");
  fields.comment = area(el, "Comment", task ? task.comment : "");

  const api = {
    el,
    onSave: null,
    onCancel: null,
    read() {
      return {
        title: fields.title.value,
        category: fields.category.value,
        project: fields.project.value,
        dueDate: fields.dueDate.value,
        estimate: fields.estimate.value,
        source: normalizeSourceInput(fields.source.value),
        nextAction: fields.nextAction.value,
        waitingFor: fields.waitingFor.value,
        followUpDate: fields.followUpDate.value,
        goal: fields.goal.value,
        comment: fields.comment.value,
        useSource: fields.useSource ? fields.useSource.checked : Boolean(fields.source.value)
      };
    }
  };
  save.onclick = () => api.onSave && api.onSave();
  cancel.onclick = () => api.onCancel && api.onCancel();
  return api;
}

function field(parent, label, value, type = "text") {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const input = document.createElement("input");
  input.type = type;
  row.appendChild(input);
  input.value = value || "";
  return input;
}

function searchField(parent, label, value, options, config = {}) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const wrap = row.createDiv("ptb-search-field");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = config.placeholder || "Type to search";
  input.value = value || "";
  wrap.appendChild(input);
  const searchButton = wrap.createEl("button", { text: "⌕" });
  searchButton.type = "button";
  searchButton.setAttribute("aria-label", `Search ${label}`);
  const results = row.createDiv("ptb-search-results");

  const renderResults = () => {
    results.empty();
    const normalized = input.value.trim().toLowerCase();
    if (!normalized) {
      results.removeClass("is-open");
      return;
    }
    const filtered = normalized
      ? options.filter((optionValue) => optionValue.toLowerCase().includes(normalized))
      : [];
    for (const optionValue of filtered.slice(0, 8)) {
      const option = results.createDiv("ptb-search-option");
      option.setText(optionValue);
      option.onclick = () => {
        input.value = optionValue;
        results.empty();
        results.removeClass("is-open");
      };
    }
    if (filtered.length === 0) {
      results.createDiv("ptb-search-empty").setText("No matches");
    }
    results.addClass("is-open");
  };
  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      results.empty();
      results.removeClass("is-open");
    }
  });
  searchButton.onclick = renderResults;
  return input;
}

function area(parent, label, value) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const input = row.createEl("textarea");
  input.value = value || "";
  autoResizeTextarea(input);
  input.addEventListener("input", () => autoResizeTextarea(input));
  return input;
}

function autoResizeTextarea(input) {
  input.style.height = "auto";
  const min = input.value.trim() ? 52 : 30;
  input.style.height = `${Math.max(min, Math.min(input.scrollHeight, 150))}px`;
}

function selectField(parent, label, value) {
  const row = parent.createDiv("ptb-form-row");
  row.createEl("label", { text: label });
  const select = document.createElement("select");
  row.appendChild(select);
  for (const column of CATEGORY_COLUMNS) {
    const option = document.createElement("option");
    option.text = column.name;
    option.value = column.id;
    select.appendChild(option);
    option.selected = column.id === value;
  }
  return select;
}

function parseTaskBlock(filePath, blockLines, lineStart, lineEnd) {
  const first = blockLines[0];
  const match = first.match(/^- \[([ xX])\] (.*)$/);
  if (!match) return null;
  const completed = match[1].toLowerCase() === "x";
  const rawBody = match[2];
  const categoryTags = [...rawBody.matchAll(/(^|\s)(#[\w-]+)/g)]
    .map((item) => item[2])
    .filter((tag) => CATEGORY_TAGS.has(tag));
  if (categoryTags.length !== 1) return null;
  const category = CATEGORY_TAGS.get(categoryTags[0]);

  const meta = {};
  for (const line of blockLines.slice(1)) {
    const metaMatch = line.match(/^\s{2,}-\s*([^:]+):\s*(.*)$/);
    if (!metaMatch) continue;
    meta[metaMatch[1].trim()] = metaMatch[2].trim();
  }
  const id = meta[META_KEYS.id];
  if (!id) return null;

  const due = rawBody.match(/📅\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  const estimate = rawBody.match(/⏱\s*([^\s]+)/);
  const project = meta[META_KEYS.project] || (rawBody.match(/#project\/([^\s]+)/) || [])[1] || "";
  let title = rawBody
    .replace(/#project\/[^\s]+/g, "")
    .replace(/#[\w-]+/g, "")
    .replace(/📅\s*[0-9]{4}-[0-9]{2}-[0-9]{2}/g, "")
    .replace(/⏱\s*[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id,
    title,
    completed,
    category,
    project,
    dueDate: due ? due[1] : "",
    estimate: estimate ? estimate[1] : "",
    source: meta[META_KEYS.source] || "",
    nextAction: meta[META_KEYS.nextAction] || "",
    waitingFor: meta[META_KEYS.waitingFor] || "",
    followUpDate: meta[META_KEYS.followUpDate] || "",
    goal: meta[META_KEYS.goal] || "",
    comment: meta[META_KEYS.comment] || "",
    filePath,
    lineStart,
    lineEnd
  };
}

function renderTaskMarkdown(task) {
  const parts = [`- [${task.completed ? "x" : " "}] ${task.title}`, tagForCategory(task.category)];
  if (task.dueDate) parts.push(`📅 ${task.dueDate}`);
  if (task.estimate) parts.push(`⏱ ${task.estimate}`);

  const lines = [parts.join(" ")];
  lines.push(`  - id: ${task.id}`);
  addMeta(lines, META_KEYS.project, task.project);
  addMeta(lines, META_KEYS.source, normalizeSourceInput(task.source));
  addMeta(lines, META_KEYS.nextAction, task.nextAction);
  addMeta(lines, META_KEYS.waitingFor, task.waitingFor);
  addMeta(lines, META_KEYS.followUpDate, task.followUpDate);
  addMeta(lines, META_KEYS.goal, task.goal);
  addMeta(lines, META_KEYS.comment, task.comment);
  return lines.join("\n");
}

function addMeta(lines, key, value) {
  if (clean(value)) lines.push(`  - ${key}: ${clean(value)}`);
}

function tagForCategory(category) {
  const column = CATEGORY_COLUMNS.find((item) => item.id === category);
  return column ? column.tag : "#inbox";
}

function categoryName(category) {
  const column = CATEGORY_COLUMNS.find((item) => item.id === category);
  return column ? column.name : category;
}

function normalizeData(data) {
  const next = Object.assign({}, DEFAULT_DATA, data || {});
  if (!Array.isArray(next.dashboards) || next.dashboards.length === 0) {
    next.dashboards = DEFAULT_DATA.dashboards;
  }
  const dashboard = next.dashboards[0];
  dashboard.today = dashboard.today || { name: "Today", layoutGroup: "primary", taskIds: [] };
  dashboard.today.taskIds = Array.isArray(dashboard.today.taskIds) ? dashboard.today.taskIds : [];
  dashboard.columns = Array.isArray(dashboard.columns) ? dashboard.columns : [];
  next.settings = Object.assign({}, DEFAULT_DATA.settings, next.settings || {});
  return next;
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceInput(value) {
  const input = clean(value);
  if (!input) return "";
  if (input.startsWith("[[")) return input;
  const label = displayPathLabel(input);
  return `[[${input}|${label}]]`;
}

function sourceToInputValue(value) {
  const source = clean(value);
  if (!source) return "";
  const match = source.match(/\[\[([^|\]]+)/);
  return match ? match[1] : source;
}

function displaySourceLabel(value) {
  const target = sourceToInputValue(value);
  return displayPathLabel(target);
}

function displayPathLabel(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("/").pop();
}

function getProjectRoot(path) {
  const parts = path.split("/");
  const index = parts.indexOf("Projects");
  if (index < 0 || parts.length <= index + 1) return "";
  return parts.slice(0, index + 2).join("/");
}

function makeTaskId() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.random().toString(16).slice(2, 8);
  return `task_${stamp}_${random}`;
}

async function ensureFile(app, path) {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return;
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder) await ensureFolder(app, folder);
  await app.vault.create(path, "");
}

async function ensureFolder(app, folder) {
  const parts = folder.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

function parseWikiTarget(source) {
  const cleaned = clean(source);
  const match = cleaned.match(/\[\[([^|\]]+)/);
  return match ? match[1] : cleaned;
}
