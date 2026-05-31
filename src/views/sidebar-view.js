const { ItemView } = require("obsidian");
const { SIDEBAR_VIEW } = require("../core/constants");
const { renderActiveTaskActions } = require("../ui/task-actions");
const { renderTaskCard } = require("../ui/task-card");
const { renderTaskForm } = require("../ui/task-form");

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
    renderActiveTaskActions(this.plugin, buttonRow);

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

module.exports = {
  SidebarView
};
