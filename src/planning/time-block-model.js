const { clean } = require("../utils/text");

function makeTimeBlockId(date = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const random = Math.random().toString(16).slice(2, 8);
  return `time_${stamp}_${random}`;
}

function todayString(date = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeTimeBlocks(blocks) {
  const usedIds = new Set();
  return (Array.isArray(blocks) ? blocks : []).map((block, index) => normalizeTimeBlock(block, usedIds, index));
}

function normalizeTimeBlock(block, usedIds = new Set(), index = 0) {
  const startTime = normalizeTime(block?.startTime, "09:00");
  return {
    id: uniqueTimeBlockId(clean(block?.id) || `time-block-${index + 1}`, usedIds),
    title: clean(block?.title) || "Untitled block",
    date: normalizeDate(block?.date),
    startTime,
    endTime: normalizeEndTime(startTime, block?.endTime),
    location: clean(block?.location),
    notes: clean(block?.notes)
  };
}

function getTimeBlocksForDate(timeBlocks, date) {
  return normalizeTimeBlocks(timeBlocks)
    .filter((block) => block.date === date)
    .sort(compareTimeBlocks);
}

function compareTimeBlocks(a, b) {
  const date = a.date.localeCompare(b.date);
  if (date !== 0) return date;
  const start = a.startTime.localeCompare(b.startTime);
  if (start !== 0) return start;
  const end = a.endTime.localeCompare(b.endTime);
  if (end !== 0) return end;
  return a.title.localeCompare(b.title);
}

function normalizeDate(value) {
  const date = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayString();
}

function normalizeTime(value, fallback) {
  const time = clean(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function normalizeEndTime(startTime, value) {
  const endTime = normalizeTime(value, "10:00");
  return endTime > startTime ? endTime : addMinutes(startTime, 60);
}

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes);
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function uniqueTimeBlockId(baseId, usedIds) {
  let id = baseId;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

module.exports = {
  makeTimeBlockId,
  todayString,
  normalizeTimeBlocks,
  normalizeTimeBlock,
  getTimeBlocksForDate,
  compareTimeBlocks
};
