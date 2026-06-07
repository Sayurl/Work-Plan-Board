const MINUTES_PER_DAY = 24 * 60;

function buildTimeBlockLayouts(blocks, options = {}) {
  const range = options.range || getTimelineRange(options.settings, blocks);
  const slotMinutes = getSlotMinutes(options.settings);
  const slotHeight = getSlotHeight(options.settings);
  const measuredHeights = options.measuredHeights || new Map();
  let offset = 0;

  return blocks.map((block) => {
    const state = options.getState ? options.getState(block) : {};
    const start = clamp(timeToMinutes(block.startTime), range.start, range.end);
    const end = clamp(timeToMinutes(block.endTime), range.start, range.end);
    const baseTop = ((start - range.start) / slotMinutes) * slotHeight;
    const baseHeight = Math.max(slotHeight, ((Math.max(end, start + slotMinutes) - start) / slotMinutes) * slotHeight);
    const measurementKey = makeTimelineMeasurementKey(block, state);
    const measuredHeight = measuredHeights.get(measurementKey) || 0;
    const height = Math.max(baseHeight, measuredHeight);
    const extraHeight = Math.max(0, height - baseHeight);
    const layout = {
      block,
      start,
      end,
      top: baseTop + offset,
      height,
      baseHeight,
      extraHeight,
      measurementKey
    };
    offset += extraHeight;
    return layout;
  });
}

function makeTimelineMeasurementKey(block, state = {}) {
  return [
    block.id,
    state.isEditing ? "editing" : "viewing",
    state.isExpanded ? "expanded" : "collapsed",
    Number(state.linkedCount) || 0,
    state.hasLinkableTasks ? "linkable" : "full"
  ].join(":");
}

function getExpandedOffsetBefore(minute, layouts) {
  return layouts
    .filter((layout) => layout.end <= minute)
    .reduce((sum, layout) => sum + layout.extraHeight, 0);
}

function getTimelineRange(settings, blocks = []) {
  const configuredStart = timeToMinutes(settings?.startTime || "09:00");
  const configuredEnd = timeToMinutes(settings?.endTime || "18:00");
  const blockStarts = blocks.map((block) => timeToMinutes(block.startTime));
  const blockEnds = blocks.map((block) => timeToMinutes(block.endTime));
  const start = Math.max(0, floorToHour(Math.min(configuredStart, ...blockStarts)));
  const end = Math.min(MINUTES_PER_DAY, ceilToHour(Math.max(configuredEnd, ...blockEnds)));
  return { start, end: Math.max(end, start + 60) };
}

function getSlotMinutes(settings) {
  const value = Number(settings?.slotMinutes);
  return Number.isFinite(value) && value >= 5 && value <= 60 ? value : 15;
}

function getSlotHeight(settings) {
  const value = Number(settings?.slotHeight);
  return Number.isFinite(value) && value >= 24 && value <= 140 ? value : 36;
}

function timeToMinutes(time) {
  if (time === "24:00") return MINUTES_PER_DAY;
  const match = String(time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(minutes) {
  const total = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function nextEndTime(startTime) {
  return minutesToTime(Math.min(MINUTES_PER_DAY, timeToMinutes(startTime) + 15));
}

function floorToHour(minutes) {
  return Math.floor(minutes / 60) * 60;
}

function ceilToHour(minutes) {
  return Math.ceil(minutes / 60) * 60;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  MINUTES_PER_DAY,
  buildTimeBlockLayouts,
  makeTimelineMeasurementKey,
  getExpandedOffsetBefore,
  getTimelineRange,
  getSlotMinutes,
  getSlotHeight,
  timeToMinutes,
  minutesToTime,
  nextEndTime
};
