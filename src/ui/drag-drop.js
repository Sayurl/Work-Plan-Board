function makeDropZone(el, onDrop) {
  el.ondragover = (event) => {
    if (!hasTaskDrag(event.dataTransfer)) return;
    event.preventDefault();
    el.addClass("is-task-drop-empty");
  };
  el.ondragleave = (event) => {
    if (el.contains(event.relatedTarget)) return;
    el.removeClass("is-task-drop-empty");
  };
  el.ondrop = async (event) => {
    event.preventDefault();
    el.removeClass("is-task-drop-empty");
    clearTaskDropIndicators(el.ownerDocument);
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) await onDrop(taskId, null);
  };
  el.addEventListener("ptb-drop-task", async (event) => {
    await onDrop(event.detail.taskId, event.detail.targetId, event.detail.placement || "before");
  });
}

function hasDragType(dataTransfer, type) {
  return Array.from(dataTransfer.types || []).includes(type);
}

function hasTaskDrag(dataTransfer) {
  return hasDragType(dataTransfer, "text/plain") && !hasDragType(dataTransfer, "application/x-work-plan-column");
}

function getVerticalPlacement(event, el) {
  const rect = el.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function getHorizontalPlacement(event, el) {
  const rect = el.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
}

function clearTaskDropIndicators(root) {
  for (const el of root.querySelectorAll(".is-task-drop-before, .is-task-drop-after, .is-task-drop-empty")) {
    el.removeClass("is-task-drop-before");
    el.removeClass("is-task-drop-after");
    el.removeClass("is-task-drop-empty");
  }
}

module.exports = {
  makeDropZone,
  hasDragType,
  hasTaskDrag,
  getVerticalPlacement,
  getHorizontalPlacement,
  clearTaskDropIndicators
};
