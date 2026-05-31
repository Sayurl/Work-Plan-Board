const { ItemView } = require("obsidian");
const { isManualColumn, isSmartColumn } = require("../columns/column-model");
const { BOARD_VIEW, SIDEBAR_VIEW } = require("../core/constants");
const { normalizeTag } = require("../utils/text");
const { field } = require("../ui/controls");
const { makeDropZone, getHorizontalPlacement, hasDragType } = require("../ui/drag-drop");
const { renderTaskCard } = require("../ui/task-card");

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
    actions.createEl("button", { text: "Add Column" }).onclick = async () => {
      await this.plugin.addColumnFromBoard("secondary");
    };
    actions.createEl("button", { text: "New Task" }).onclick = () => {
      this.plugin.selectedTaskId = null;
      this.plugin.openSidebar();
      for (const leaf of this.plugin.app.workspace.getLeavesOfType(SIDEBAR_VIEW)) {
        leaf.view.mode = "create";
        leaf.view.render();
      }
    };

    const primary = container.createDiv("ptb-board-section ptb-primary");
    this.makeColumnDropZone(primary, "primary");
    this.renderToday(primary);
    for (const column of this.plugin.dashboard.columns.filter((item) => item.layoutGroup === "primary")) {
      this.renderColumn(primary, column);
    }

    const secondary = container.createDiv("ptb-board-section ptb-secondary");
    this.makeColumnDropZone(secondary, "secondary");
    for (const column of this.plugin.dashboard.columns.filter((item) => item.layoutGroup !== "primary")) {
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
    makeDropZone(list, async (taskId, targetId, placement) => {
      await this.plugin.addToToday(taskId);
      await this.plugin.reorderTaskList(this.plugin.dashboard.today.taskIds, taskId, targetId, placement);
    });
    for (const task of this.plugin.getTodayTasks()) {
      list.appendChild(renderTaskCard(this.plugin, task, { inToday: true }));
    }
  }

  renderColumn(parent, column) {
    const tasks = this.plugin.getTasksForColumn(column.id);
    const columnEl = parent.createDiv("ptb-column");
    if (isSmartColumn(column)) columnEl.addClass("ptb-column-smart");
    columnEl.dataset.columnId = column.id;
    const header = columnEl.createDiv("ptb-column-header");
    const title = header.createDiv("ptb-column-title");
    const dragHandle = title.createSpan({ text: "⋮⋮", cls: "ptb-column-drag-handle" });
    dragHandle.draggable = true;
    dragHandle.setAttribute("aria-label", `Drag ${column.name} column`);
    dragHandle.ondragstart = (event) => {
      event.dataTransfer.setData("application/x-work-plan-column", column.id);
      event.dataTransfer.effectAllowed = "move";
      columnEl.addClass("is-dragging");
    };
    dragHandle.ondragend = () => {
      columnEl.removeClass("is-dragging");
      this.clearColumnDropIndicators();
    };
    title.createEl("h3", { text: column.name });
    title.createSpan({ text: String(tasks.length), cls: "ptb-count" });
    if (isSmartColumn(column)) title.createSpan({ text: "Auto", cls: "ptb-chip" });
    const controls = header.createDiv("ptb-column-controls");
    controls.createEl("button", { text: "←", attr: { "aria-label": "Move column left" } }).onclick = async () => {
      await this.plugin.moveColumn(column.id, -1);
    };
    controls.createEl("button", { text: "→", attr: { "aria-label": "Move column right" } }).onclick = async () => {
      await this.plugin.moveColumn(column.id, 1);
    };
    const layoutButton = controls.createEl("button", {
      text: column.layoutGroup === "primary" ? "↓" : "↑",
      attr: { "aria-label": column.layoutGroup === "primary" ? "Move column to bottom section" : "Move column to top section" }
    });
    layoutButton.onclick = async () => {
      await this.plugin.updateColumnLayout(column.id, column.layoutGroup === "primary" ? "secondary" : "primary");
    };
    controls.createEl("button", { text: "Edit" }).onclick = () => {
      this.renderColumnEditor(columnEl, column);
    };
    this.makeColumnTarget(columnEl, column);
    const list = columnEl.createDiv("ptb-card-list");
    list.dataset.column = column.id;
    if (isManualColumn(column)) {
      makeDropZone(list, async (taskId, targetId, placement) => {
        const task = this.plugin.getTask(taskId);
        if (!task) return;
        if (task.category === column.id) {
          await this.plugin.reorderTaskList(column.taskIds, taskId, targetId, placement);
        } else {
          await this.plugin.moveTaskToCategory(taskId, column.id, targetId, placement);
        }
      });
    }
    for (const task of tasks) {
      list.appendChild(renderTaskCard(this.plugin, task, {
        inToday: this.plugin.dashboard.today.taskIds.includes(task.id),
        disableDrop: isSmartColumn(column)
      }));
    }
  }

  makeColumnDropZone(section, layoutGroup) {
    section.ondragover = (event) => {
      if (!hasDragType(event.dataTransfer, "application/x-work-plan-column")) return;
      event.preventDefault();
      this.updateColumnDropFromSection(section, event);
      section.addClass("is-column-drop-target");
    };
    section.ondragleave = (event) => {
      if (section.contains(event.relatedTarget)) return;
      section.removeClass("is-column-drop-target");
    };
    section.ondrop = async (event) => {
      const columnId = event.dataTransfer.getData("application/x-work-plan-column");
      if (!columnId) return;
      event.preventDefault();
      const target = this.getColumnDropTargetFromSection(section, event, columnId);
      section.removeClass("is-column-drop-target");
      if (target) await this.plugin.moveColumnTo(columnId, target.columnId, layoutGroup, target.placement);
      else await this.plugin.moveColumnToGroupEnd(columnId, layoutGroup);
    };
  }

  updateColumnDropFromSection(section, event) {
    const draggedId = event.dataTransfer.getData("application/x-work-plan-column");
    const target = this.getColumnDropTargetFromSection(section, event, draggedId);
    this.clearColumnDropIndicators();
    if (!target) return;
    const targetEl = [...section.querySelectorAll(".ptb-column[data-column-id]")].find((el) => el.dataset.columnId === target.columnId);
    if (targetEl) targetEl.addClass(target.placement === "after" ? "is-column-drop-after" : "is-column-drop-before");
  }

  getColumnDropTargetFromSection(section, event, draggedId) {
    const allColumns = [...section.querySelectorAll(".ptb-column[data-column-id]")];
    const columns = allColumns.filter((el) => el.dataset.columnId !== draggedId);
    if (columns.length === 0) return null;
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const rowTolerance = 36;
    const sameRowAllColumns = allColumns.filter((columnEl) => {
      const rect = columnEl.getBoundingClientRect();
      return pointerY >= rect.top - rowTolerance && pointerY <= rect.bottom + rowTolerance;
    });
    const gapColumns = sameRowAllColumns.length > 0 ? sameRowAllColumns : allColumns;
    const sortedByLeft = gapColumns
      .map((columnEl) => ({ columnEl, rect: columnEl.getBoundingClientRect() }))
      .sort((a, b) => a.rect.left - b.rect.left);
    for (let index = 0; index < sortedByLeft.length - 1; index += 1) {
      const left = sortedByLeft[index];
      const right = sortedByLeft[index + 1];
      if (pointerX >= left.rect.right && pointerX <= right.rect.left) {
        return this.getColumnGapTarget(left, right, draggedId);
      }
    }
    const sameRowColumns = columns.filter((columnEl) => {
      const rect = columnEl.getBoundingClientRect();
      return pointerY >= rect.top - rowTolerance && pointerY <= rect.bottom + rowTolerance;
    });
    const candidates = sameRowColumns.length > 0 ? sameRowColumns : columns;
    let nearest = null;
    const rightmost = candidates.reduce((right, columnEl) => {
      const rect = columnEl.getBoundingClientRect();
      return !right || rect.right > right.rect.right ? { columnEl, rect } : right;
    }, null);
    if (rightmost && pointerX > rightmost.rect.right) {
      return { columnId: rightmost.columnEl.dataset.columnId, placement: "after" };
    }
    const leftmost = candidates.reduce((left, columnEl) => {
      const rect = columnEl.getBoundingClientRect();
      return !left || rect.left < left.rect.left ? { columnEl, rect } : left;
    }, null);
    if (leftmost && pointerX < leftmost.rect.left) {
      return { columnId: leftmost.columnEl.dataset.columnId, placement: "before" };
    }
    for (const columnEl of candidates) {
      const rect = columnEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
      if (!nearest || distance < nearest.distance) {
        nearest = { columnEl, rect, distance };
      }
    }
    const placement = pointerX > nearest.rect.left + nearest.rect.width / 2 ? "after" : "before";
    return { columnId: nearest.columnEl.dataset.columnId, placement };
  }

  getColumnGapTarget(left, right, draggedId) {
    if (left.columnEl.dataset.columnId === draggedId) {
      return { columnId: right.columnEl.dataset.columnId, placement: "after" };
    }
    if (right.columnEl.dataset.columnId === draggedId) {
      return { columnId: left.columnEl.dataset.columnId, placement: "before" };
    }
    return { columnId: left.columnEl.dataset.columnId, placement: "after" };
  }

  makeColumnTarget(columnEl, column) {
    columnEl.ondragover = (event) => {
      if (!hasDragType(event.dataTransfer, "application/x-work-plan-column")) return;
      const draggedId = event.dataTransfer.getData("application/x-work-plan-column");
      if (!draggedId || draggedId === column.id) return;
      event.preventDefault();
      this.clearColumnDropIndicators();
      columnEl.addClass(getHorizontalPlacement(event, columnEl) === "after" ? "is-column-drop-after" : "is-column-drop-before");
    };
    columnEl.ondrop = async (event) => {
      const draggedId = event.dataTransfer.getData("application/x-work-plan-column");
      if (!draggedId || draggedId === column.id) return;
      event.preventDefault();
      event.stopPropagation();
      const placement = getHorizontalPlacement(event, columnEl);
      this.clearColumnDropIndicators();
      await this.plugin.moveColumnTo(draggedId, column.id, column.layoutGroup, placement);
    };
  }

  clearColumnDropIndicators() {
    for (const el of this.containerEl.querySelectorAll(".is-column-drop-before, .is-column-drop-after, .is-column-drop-target")) {
      el.removeClass("is-column-drop-before");
      el.removeClass("is-column-drop-after");
      el.removeClass("is-column-drop-target");
    }
  }

  renderColumnEditor(columnEl, column) {
    const existing = columnEl.querySelector(".ptb-column-editor");
    if (existing) {
      existing.remove();
      return;
    }
    const editor = columnEl.createDiv("ptb-column-editor");
    const nameInput = field(editor, "Name", column.name);
    const tagInput = isManualColumn(column) ? field(editor, "Tag", column.categoryTag) : null;
    if (isSmartColumn(column)) {
      editor.createDiv({
        text: column.smartType === "deadline" ? "Shows tasks with due dates automatically." : "Automatic column.",
        cls: "ptb-column-editor-note"
      });
    }
    const row = editor.createDiv("ptb-column-editor-actions");
    row.createEl("button", { text: "Save" }).onclick = async () => {
      await this.plugin.renameColumn(column.id, nameInput.value);
      if (tagInput) {
        const tag = normalizeTag(tagInput.value);
        if (tag && tag !== column.categoryTag) {
          await this.plugin.updateColumnTag(column.id, tag);
        }
      }
    };
    row.createEl("button", { text: "Cancel" }).onclick = () => editor.remove();
    if (isManualColumn(column) && this.plugin.getManualColumns().length > 1) {
      const deleteBox = editor.createDiv("ptb-column-delete");
      deleteBox.createEl("label", { text: "Move tasks to" });
      const targetSelect = document.createElement("select");
      for (const option of this.plugin.getColumnOptions(column.id)) {
        const targetOption = document.createElement("option");
        targetOption.value = option.id;
        targetOption.text = option.name;
        targetSelect.appendChild(targetOption);
      }
      deleteBox.appendChild(targetSelect);
      deleteBox.createEl("button", { text: "Delete Column", cls: "mod-warning" }).onclick = async () => {
        await this.plugin.deleteColumn(column.id, targetSelect.value);
      };
    } else if (isSmartColumn(column) && this.plugin.dashboard.columns.length > 1) {
      row.createEl("button", { text: "Delete Column", cls: "mod-warning" }).onclick = async () => {
        await this.plugin.deleteColumn(column.id, "");
      };
    }
  }
}

module.exports = {
  BoardView
};
