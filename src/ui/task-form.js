const { setIcon } = require("obsidian");
const { defaultColumnId } = require("../columns/column-model");
const { normalizeSourceInput, sourceToInputValue } = require("../utils/source-links");
const { area, field, searchField, selectField } = require("./controls");

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
  fields.category = selectField(el, "Category", task ? task.category : defaultColumnId(plugin.dashboard.columns), plugin.getManualColumns());
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
    const sourcePanel = el.createDiv("ptb-source-note-panel");
    const sourceButton = sourcePanel.createEl("button", {
      cls: "ptb-icon-button ptb-source-current-button",
      attr: { type: "button" }
    });
    setIcon(sourceButton, "link");
    sourceButton.createSpan({ text: "Set Current Note as Source" });
    sourceButton.disabled = !activeSource;
    sourceButton.onclick = () => {
      if (!activeSource) return;
      fields.source.value = activeSource;
    };
    const sourceHelp = activeSource
      ? "Uses the open note as this task's source."
      : "Open a note to use it as this task's source.";
    sourcePanel.createDiv({ text: sourceHelp, cls: "ptb-form-note" });
    if (activeSource) fields.source.value = activeSource;
    fields.usesActiveSource = () => Boolean(activeSource && fields.source.value.trim() === activeSource);
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
        useSource: fields.usesActiveSource ? fields.usesActiveSource() : Boolean(fields.source.value)
      };
    }
  };
  save.onclick = () => api.onSave && api.onSave();
  cancel.onclick = () => api.onCancel && api.onCancel();
  return api;
}

module.exports = {
  renderTaskForm
};
