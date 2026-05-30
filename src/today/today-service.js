function addTaskToToday(today, taskId) {
  if (!today.taskIds.includes(taskId)) today.taskIds.push(taskId);
}

function removeTaskFromToday(today, taskId) {
  today.taskIds = today.taskIds.filter((id) => id !== taskId);
}

function reorderTaskList(list, taskId, targetId, placement = "before") {
  const current = list.indexOf(taskId);
  if (current >= 0) list.splice(current, 1);
  const target = targetId ? list.indexOf(targetId) : -1;
  if (target >= 0) list.splice(placement === "after" ? target + 1 : target, 0, taskId);
  else list.push(taskId);
}

module.exports = {
  addTaskToToday,
  removeTaskFromToday,
  reorderTaskList
};
