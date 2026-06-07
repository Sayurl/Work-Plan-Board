const { ItemView, Notice, setIcon } = require("obsidian");
const { SCHEDULE_VIEW } = require("../core/constants");
const { TIME_BLOCK_RELATION_TYPES } = require("../planning/task-time-link-model");
const { buildTimeBlockLayouts, getExpandedOffsetBefore, getSlotHeight, getSlotMinutes, getTimelineRange, minutesToTime, nextEndTime, timeToMinutes } = require("../planning/timeline-layout");
const { area, field, timeSelectField } = require("../ui/controls");
const { extractFirstUrl } = require("../utils/urls");

class ScheduleView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedDate = plugin.getTodayDate();
    this.isCreatingTimeBlock = false;
    this.editingTimeBlockId = "";
    this.expandedBundleIds = new Set();
    this.measuredBundleHeights = new Map();
  }

  getViewType() {
    return SCHEDULE_VIEW;
  }

  getDisplayText() {
    return "Schedule Board";
  }

  async onOpen() {
    await this.plugin.refreshTasks();
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ptb-view");
    container.addClass("ptb-schedule-view");

    this.renderToolbar(container);
    this.renderDayTimeline(container);
  }

  renderToolbar(container) {
    const toolbar = container.createDiv("ptb-toolbar ptb-schedule-toolbar");
    const title = toolbar.createDiv("ptb-schedule-title");
    title.createEl("h2", { text: "Schedule Board" });
    title.createSpan({ text: this.formatDateLabel(this.selectedDate), cls: "ptb-chip" });

    const actions = toolbar.createDiv("ptb-toolbar-actions");
    actions.createEl("button", { text: "<" }).onclick = () => this.changeDate(-1);
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = this.selectedDate;
    dateInput.onchange = () => {
      if (!dateInput.value) return;
      this.selectedDate = dateInput.value;
      this.cancelEditing();
      this.render();
    };
    actions.appendChild(dateInput);
    actions.createEl("button", { text: "Today" }).onclick = () => {
      this.selectedDate = this.plugin.getTodayDate();
      this.cancelEditing();
      this.render();
    };
    actions.createEl("button", { text: ">" }).onclick = () => this.changeDate(1);
    actions.createEl("button", { text: "New Block", cls: "mod-cta" }).onclick = () => {
      this.isCreatingTimeBlock = true;
      this.editingTimeBlockId = "";
      this.render();
    };
    actions.createEl("button", { text: "Refresh" }).onclick = () => this.plugin.refreshTasks();
  }

  renderDayTimeline(container) {
    const blocks = this.plugin.getTimeBlocksForDate(this.selectedDate);
    const range = getTimelineRange(this.plugin.config.timelineSettings, blocks);
    const slotMinutes = getSlotMinutes(this.plugin.config.timelineSettings);
    const slotHeight = getSlotHeight(this.plugin.config.timelineSettings);
    const totalMinutes = Math.max(slotMinutes, range.end - range.start);
    const baseTimelineHeight = Math.ceil(totalMinutes / slotMinutes) * slotHeight;
    const layouts = buildTimeBlockLayouts(blocks, {
      range,
      settings: this.plugin.config.timelineSettings,
      measuredHeights: this.measuredBundleHeights,
      getState: (block) => ({
        isEditing: this.editingTimeBlockId === block.id,
        isExpanded: this.editingTimeBlockId !== block.id && this.expandedBundleIds.has(block.id),
        linkedCount: this.plugin.getLinkedTasksForTimeBlock(block.id).length,
        hasLinkableTasks: this.hasLinkableTasks(block)
      })
    });
    const timelineHeight = baseTimelineHeight + layouts.reduce((sum, layout) => sum + layout.extraHeight, 0);

    if (this.isCreatingTimeBlock) {
      this.renderTimeBlockEditor(container, null);
    }

    const timeline = container.createDiv("ptb-day-timeline");
    timeline.style.setProperty("--ptb-day-timeline-height", `${timelineHeight}px`);

    const axis = timeline.createDiv("ptb-day-axis");
    const canvas = timeline.createDiv("ptb-day-canvas");
    canvas.style.height = `${timelineHeight}px`;

    this.renderTimeGrid(axis, canvas, range, slotMinutes, slotHeight, layouts);

    if (blocks.length === 0 && !this.isCreatingTimeBlock) {
      canvas.createDiv({ text: "No blocks for this day.", cls: "ptb-empty ptb-day-empty" });
      return;
    }

    for (const block of blocks) {
      this.renderTimeBlockBundle(canvas, layouts.find((layout) => layout.block.id === block.id));
    }
  }

  renderTimeGrid(axis, canvas, range, slotMinutes, slotHeight, layouts) {
    for (let minute = range.start; minute <= range.end; minute += slotMinutes) {
      const top = ((minute - range.start) / slotMinutes) * slotHeight + getExpandedOffsetBefore(minute, layouts);
      const line = canvas.createDiv("ptb-day-grid-line");
      line.style.top = `${top}px`;
      if (minute % 60 === 0) {
        const label = axis.createDiv("ptb-day-time-label");
        label.style.top = `${top}px`;
        label.setText(minutesToTime(minute));
        line.addClass("is-hour");
      }
    }
  }

  renderTimeBlockBundle(parent, layout) {
    if (!layout) return;
    const { block } = layout;
    const linked = this.plugin.getLinkedTasksForTimeBlock(block.id);
    const byRelation = relationGroups(linked);
    const isEditing = this.editingTimeBlockId === block.id;
    const isExpanded = !isEditing && this.expandedBundleIds.has(block.id);

    const bundle = parent.createDiv("ptb-time-block-bundle");
    bundle.style.top = `${layout.top}px`;
    bundle.style.height = `${layout.height}px`;

    const card = bundle.createDiv("ptb-time-block ptb-schedule-block");
    card.toggleClass("is-expanded", isExpanded);
    card.toggleClass("is-editing", isEditing);
    card.style.height = `${layout.height}px`;
    const topRow = card.createDiv("ptb-time-block-top");
    topRow.createSpan({ text: `${block.startTime}-${block.endTime}`, cls: "ptb-time-block-time" });
    topRow.createEl("strong", { text: block.title });
    const actions = topRow.createDiv("ptb-time-block-actions");
    actions.createEl("button", { text: "Edit" }).onclick = () => {
      this.isCreatingTimeBlock = false;
      this.editingTimeBlockId = block.id;
      this.render();
    };
    actions.createEl("button", { text: "Delete", cls: "mod-warning" }).onclick = async () => {
      await this.plugin.deleteTimeBlock(block.id);
    };

    if (block.location || block.notes) {
      const meta = card.createDiv("ptb-time-block-meta");
      if (block.location) this.renderTimeBlockLocation(meta, block.location);
      if (block.notes) meta.createSpan({ text: block.notes, cls: "ptb-chip" });
    }

    if (isEditing) {
      this.renderEditExpander(card, block);
    } else {
      this.renderTaskExpander(card, block, byRelation, linked.length, isExpanded);
    }
    this.measureTimeBlockCard(card, layout);
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

  renderBundleLinks(parent, linked, timeBlockId, relation) {
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

  renderEditExpander(parent, block) {
    const expander = parent.createDiv("ptb-time-block-edit-expander");
    const header = expander.createDiv("ptb-time-block-task-toggle ptb-time-block-edit-label");
    header.createSpan({ text: "▾", cls: "ptb-expander-chevron" });
    header.createSpan({ text: "Edit" });
    this.renderTimeBlockEditor(expander, block);
  }

  renderTaskExpander(parent, block, byRelation, linkedCount, isExpanded) {
    const expander = parent.createDiv("ptb-time-block-task-expander");
    const toggle = expander.createEl("button", {
      cls: "ptb-time-block-task-toggle",
      attr: { type: "button", "aria-expanded": String(isExpanded) }
    });
    toggle.createSpan({ text: isExpanded ? "▾" : "▸", cls: "ptb-expander-chevron" });
    toggle.createSpan({ text: `Linked tasks (${linkedCount})` });
    toggle.onclick = () => {
      if (isExpanded) this.expandedBundleIds.delete(block.id);
      else this.expandedBundleIds.add(block.id);
      this.render();
    };
    if (!isExpanded) return;

    const body = expander.createDiv("ptb-time-block-task-body");
    this.renderBundleLinks(body, byRelation.before, block.id, "before");
    this.renderBundleLinks(body, byRelation.inside, block.id, "inside");
    this.renderBundleLinks(body, byRelation.related, block.id, "related");
    this.renderBundleLinks(body, byRelation.after, block.id, "after");
    this.renderTimeBlockLinker(body, block);
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

  hasLinkableTasks(block) {
    return this.plugin.getTaskOptions().some((task) => !this.plugin.getTaskTimeLinks(block.id).some((link) => link.taskId === task.id));
  }

  measureTimeBlockCard(card, layout) {
    requestAnimationFrame(() => {
      if (!card.isConnected) return;
      const measuredHeight = Math.ceil(card.scrollHeight);
      const previous = this.measuredBundleHeights.get(layout.measurementKey) || 0;
      if (Math.abs(measuredHeight - previous) <= 1) return;
      this.measuredBundleHeights.set(layout.measurementKey, measuredHeight);
      this.render();
    });
  }

  renderTimeBlockEditor(parent, block) {
    const editor = parent.createDiv("ptb-time-block-editor ptb-schedule-editor");
    const date = field(editor, "Date", block ? block.date : this.selectedDate, "date");
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
      this.cancelEditing();
      this.selectedDate = input.date || this.selectedDate;
      if (block) await this.plugin.updateTimeBlock(block.id, input);
      else await this.plugin.createTimeBlock(input);
    };
    actions.createEl("button", { text: "Cancel" }).onclick = () => {
      this.cancelEditing();
      this.render();
    };
  }

  changeDate(days) {
    this.selectedDate = addDays(this.selectedDate, days);
    this.cancelEditing();
    this.render();
  }

  cancelEditing() {
    this.isCreatingTimeBlock = false;
    this.editingTimeBlockId = "";
  }

  formatDateLabel(date) {
    const parsed = parseLocalDate(date);
    return parsed.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }
}

function relationGroups(linked) {
  return {
    before: linked.filter((item) => item.link.relation === "before"),
    inside: linked.filter((item) => item.link.relation === "inside"),
    after: linked.filter((item) => item.link.relation === "after"),
    related: linked.filter((item) => item.link.relation === "related")
  };
}

function addDays(date, days) {
  const parsed = parseLocalDate(date);
  parsed.setDate(parsed.getDate() + days);
  const pad = (number) => String(number).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function parseLocalDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

module.exports = {
  ScheduleView
};
