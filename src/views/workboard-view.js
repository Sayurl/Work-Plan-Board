const { ItemView, Notice, setIcon } = require("obsidian");
const { isManualColumn, isSmartColumn } = require("../columns/column-model");
const { BOARD_VIEW, SIDEBAR_VIEW } = require("../core/constants");
const { TIME_BLOCK_RELATION_TYPES } = require("../planning/task-time-link-model");
const { normalizeTag } = require("../utils/text");
const { area, field, timeSelectField } = require("../ui/controls");
const { makeDropZone, getHorizontalPlacement, hasDragType } = require("../ui/drag-drop");
const { renderTaskCard } = require("../ui/task-card");
const { extractFirstUrl } = require("../utils/urls");

class BoardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.isCreatingTimeBlock = false;
    this.editingTimeBlockId = "";
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
    actions.createEl("button", { text: "Schedule" }).onclick = () => this.plugin.openScheduleBoard();
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
    const controls = header.createDiv("ptb-column-controls");
    controls.createEl("button", { text: "New Block" }).onclick = () => {
      this.isCreatingTimeBlock = true;
      this.editingTimeBlockId = "";
      this.render();
    };
    this.renderTodayTimeline(columnEl);
    columnEl.createEl("h4", { text: "Priority", cls: "ptb-subheading" });
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

  renderTodayTimeline(parent) {
    const section = parent.createDiv("ptb-timeline");
    const title = section.createDiv("ptb-timeline-title");
    title.createEl("h4", { text: "Timeline" });
    title.createSpan({ text: this.plugin.getTodayDate(), cls: "ptb-chip" });

    if (this.isCreatingTimeBlock) {
      this.renderTimeBlockEditor(section, null);
    }

    const blocks = this.plugin.getTodayTimeBlocks();
    if (blocks.length === 0 && !this.isCreatingTimeBlock) {
      section.createDiv({ text: "No blocks today.", cls: "ptb-empty" });
      return;
    }

    for (const block of blocks) {
      if (this.editingTimeBlockId === block.id) {
        this.renderTimeBlockEditor(section, block);
      } else {
        this.renderTimeBlock(section, block);
      }
    }
  }

  renderTimeBlock(parent, block) {
    const linked = this.plugin.getLinkedTasksForTimeBlock(block.id);
    const before = linked.filter((item) => item.link.relation === "before");
    const inside = linked.filter((item) => item.link.relation === "inside");
    const after = linked.filter((item) => item.link.relation === "after");
    const related = linked.filter((item) => item.link.relation === "related");
    const group = parent.createDiv("ptb-time-block-group");

    this.renderTimeBlockLinks(group, before, block.id, "before");

    const item = group.createDiv("ptb-time-block");
    const top = item.createDiv("ptb-time-block-top");
    top.createSpan({ text: `${block.startTime}-${block.endTime}`, cls: "ptb-time-block-time" });
    top.createEl("strong", { text: block.title });
    const actions = top.createDiv("ptb-time-block-actions");
    actions.createEl("button", { text: "Edit" }).onclick = () => {
      this.isCreatingTimeBlock = false;
      this.editingTimeBlockId = block.id;
      this.render();
    };
    actions.createEl("button", { text: "Delete", cls: "mod-warning" }).onclick = async () => {
      await this.plugin.deleteTimeBlock(block.id);
    };

    if (block.location || block.notes) {
      const meta = item.createDiv("ptb-time-block-meta");
      if (block.location) this.renderTimeBlockLocation(meta, block.location);
      if (block.notes) meta.createSpan({ text: block.notes, cls: "ptb-chip" });
    }

    this.renderTimeBlockLinks(item, inside, block.id, "inside");
    this.renderTimeBlockLinks(item, related, block.id, "related");
    this.renderTimeBlockLinker(item, block);
    this.renderTimeBlockLinks(group, after, block.id, "after");
  }

  renderTimeBlockLocation(parent, location) {
    const wrap = parent.createDiv("ptb-time-block-location");
    const url = extractFirstUrl(location);
    if (url) {
      const link = wrap.createEl("a", {
        text: location,
        cls: "ptb-time-block-location-text",
        attr: { href: url, target: "_blank", rel: "noopener" }
      });
      link.onclick = (event) => event.stopPropagation();
    } else {
      wrap.createSpan({ text: location, cls: "ptb-time-block-location-text" });
    }
    const copyButton = wrap.createEl("button", {
      cls: "ptb-icon-button ptb-location-copy-button",
      attr: { type: "button", "aria-label": "Copy location" }
    });
    setIcon(copyButton, "copy");
    copyButton.onclick = async (event) => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(location);
        new Notice("Location copied.");
      } catch (error) {
        new Notice("Could not copy location.");
      }
    };
  }

  renderTimeBlockLinks(parent, linked, timeBlockId, relation) {
    if (linked.length === 0) return;
    const list = parent.createDiv(`ptb-time-block-links ptb-time-block-links-${relation}`);
    for (const { link, task } of linked) {
      const row = list.createDiv("ptb-time-block-link");
      row.createSpan({ text: link.relation, cls: "ptb-chip" });
      row.createSpan({ text: task.title });
      row.createEl("button", { text: "Unlink" }).onclick = async () => {
        await this.plugin.unlinkTaskFromTimeBlock(task.id, timeBlockId);
      };
    }
  }

  renderTimeBlockLinker(parent, block) {
    const taskOptions = this.plugin.getTaskOptions().filter((task) => !this.plugin.getTaskTimeLinks(block.id).some((link) => link.taskId === task.id));
    if (taskOptions.length === 0) return;
    const row = parent.createDiv("ptb-time-block-linker");
    const taskSelect = document.createElement("select");
    for (const task of taskOptions) {
      const option = document.createElement("option");
      option.value = task.id;
      option.text = task.name;
      taskSelect.appendChild(option);
    }
    row.appendChild(taskSelect);
    const relationSelect = document.createElement("select");
    for (const relation of TIME_BLOCK_RELATION_TYPES) {
      const option = document.createElement("option");
      option.value = relation;
      option.text = relation;
      relationSelect.appendChild(option);
    }
    relationSelect.value = "inside";
    row.appendChild(relationSelect);
    row.createEl("button", { text: "Link" }).onclick = async () => {
      await this.plugin.linkTaskToTimeBlock(taskSelect.value, block.id, relationSelect.value);
    };
  }

  renderTimeBlockEditor(parent, block) {
    const editor = parent.createDiv("ptb-time-block-editor");
    const date = field(editor, "Date", block ? block.date : this.plugin.getTodayDate(), "date");
    const title = field(editor, "Title", block ? block.title : "");
    const startTime = timeSelectField(editor, "Start", block ? block.startTime : this.plugin.config.timelineSettings.startTime);
    const endTime = timeSelectField(editor, "End", block ? block.endTime : this.plugin.config.timelineSettings.endTime, { allow24: true });
    const clampEndTime = () => {
      if (startTime.value && endTime.value && timeToMinutes(endTime.value) <= timeToMinutes(startTime.value)) {
        endTime.value = nextEndTime(startTime.value);
      }
    };
    startTime.addEventListener("input", clampEndTime);
    startTime.addEventListener("change", clampEndTime);
    endTime.addEventListener("change", clampEndTime);
    const location = field(editor, "Location", block ? block.location : "");
    const notes = area(editor, "Notes", block ? block.notes : "");
    const actions = editor.createDiv("ptb-time-block-editor-actions");
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).onclick = async () => {
      const input = {
        date: date.value,
        title: title.value,
        startTime: startTime.value,
        endTime: endTime.value,
        location: location.value,
        notes: notes.value
      };
      this.isCreatingTimeBlock = false;
      this.editingTimeBlockId = "";
      if (block) await this.plugin.updateTimeBlock(block.id, input);
      else await this.plugin.createTimeBlock(input);
    };
    actions.createEl("button", { text: "Cancel" }).onclick = () => {
      this.isCreatingTimeBlock = false;
      this.editingTimeBlockId = "";
      this.render();
    };
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

function timeToMinutes(time) {
  if (time === "24:00") return 24 * 60;
  const match = String(time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function nextEndTime(startTime) {
  const total = Math.min(24 * 60, timeToMinutes(startTime) + 15);
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
