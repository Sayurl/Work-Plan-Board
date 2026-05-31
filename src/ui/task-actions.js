function renderActiveTaskActions(plugin, parent) {
  const task = plugin.getActiveTask();
  if (!task) return;

  const actions = parent.createDiv("ptb-active-task-actions");
  actions.createSpan({ text: task.title, cls: "ptb-active-task-label" });

  actions.createEl("button", { text: "Edit" }).onclick = () => {
    plugin.selectTask(task.id);
  };

  const inToday = plugin.dashboard.today.taskIds.includes(task.id);
  actions.createEl("button", { text: inToday ? "Remove Today" : "Add Today" }).onclick = async () => {
    if (inToday) await plugin.removeFromToday(task.id);
    else await plugin.addToToday(task.id);
  };

  actions.createEl("button", { text: "File" }).onclick = async () => {
    await plugin.openTaskFile(task);
  };
}

module.exports = {
  renderActiveTaskActions
};
