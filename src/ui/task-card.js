const { MarkdownRenderer } = require("obsidian");
const { categoryName } = require("../columns/column-model");
const { displayPathLabel, displaySourceLabel } = require("../utils/source-links");
const { clearTaskDropIndicators, getVerticalPlacement, hasTaskDrag } = require("./drag-drop");

function renderTaskCard(plugin, task, options = {}) {
  const card = document.createElement("div");
  card.className = `ptb-card${task.completed ? " is-completed" : ""}`;
  if (plugin.activeTaskId === task.id) card.addClass("is-active");
  card.draggable = true;
  card.dataset.taskId = task.id;

  card.ondragstart = (event) => {
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
  };
  card.ondragend = () => clearTaskDropIndicators(document);
  if (!options.disableDrop) {
    card.ondragover = (event) => {
      if (!hasTaskDrag(event.dataTransfer)) return;
      event.preventDefault();
      clearTaskDropIndicators(card.ownerDocument);
      card.addClass(getVerticalPlacement(event, card) === "after" ? "is-task-drop-after" : "is-task-drop-before");
    };
    card.ondragleave = (event) => {
      if (card.contains(event.relatedTarget)) return;
      card.removeClass("is-task-drop-before");
      card.removeClass("is-task-drop-after");
    };
    card.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const droppedId = event.dataTransfer.getData("text/plain");
      const placement = getVerticalPlacement(event, card);
      clearTaskDropIndicators(card.ownerDocument);
      const list = card.parentElement;
      if (list) list.dispatchEvent(new CustomEvent("ptb-drop-task", { detail: { taskId: droppedId, targetId: task.id, placement } }));
    };
  }
  card.onclick = (event) => {
    if (event.target.closest("button") || event.target.closest("a") || event.target.closest("summary")) return;
    plugin.toggleTaskDetails(task.id);
  };
  card.ondblclick = (event) => {
    if (event.target.closest("button") || event.target.closest("a") || event.target.closest("summary")) return;
    event.preventDefault();
    plugin.selectTask(task.id);
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
  meta.createSpan({ text: categoryName(task.category, plugin.dashboard.columns), cls: "ptb-chip" });
  if (task.project) meta.createSpan({ text: displayPathLabel(task.project), cls: "ptb-chip" });
  if (task.dueDate) meta.createSpan({ text: `Due ${task.dueDate}`, cls: "ptb-chip ptb-chip-due" });
  if (task.estimate) meta.createSpan({ text: task.estimate, cls: "ptb-chip" });
  if (task.waitingFor) meta.createSpan({ text: task.waitingFor, cls: "ptb-chip" });
  if (task.followUpDate) meta.createSpan({ text: `Check ${task.followUpDate}`, cls: "ptb-chip" });
  if (task.source) {
    const sourceButton = meta.createEl("button", { text: "Note", cls: "ptb-chip ptb-chip-button ptb-source-button" });
    sourceButton.setAttribute("title", displaySourceLabel(task.source) || "Source note");
    sourceButton.onclick = (event) => {
      event.stopPropagation();
      plugin.openSource(task);
    };
  }

  if (task.nextAction || task.goal || task.comment || task.source || options.compact) {
    const details = card.createEl("details", { cls: "ptb-details" });
    details.open = plugin.expandedTaskId === task.id;
    details.createEl("summary", { text: "Details" });
    if (task.nextAction) details.createEl("p", { text: `Next: ${task.nextAction}` });
    if (task.goal) details.createEl("p", { text: `Goal: ${task.goal}` });
    if (task.comment) renderMarkdownDetail(plugin, task, details, "Comment", task.comment);
    if (task.source) details.createEl("p", { text: `Source: ${displaySourceLabel(task.source)}` });
    if (!task.nextAction && !task.goal && !task.comment && !task.source) {
      details.createEl("p", { text: "No details yet." });
    }
  }

  return card;
}

function renderMarkdownDetail(plugin, task, parent, label, markdown) {
  const section = parent.createDiv("ptb-markdown-detail");
  section.createEl("strong", { text: `${label}:` });
  const content = section.createDiv("ptb-markdown-content");
  MarkdownRenderer.render(plugin.app, markdown, content, task.filePath || "", plugin);
}

module.exports = {
  renderTaskCard
};
