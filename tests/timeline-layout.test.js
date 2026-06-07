const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTimeBlockLayouts,
  getExpandedOffsetBefore,
  getSlotHeight,
  getSlotMinutes,
  getTimelineRange,
  makeTimelineMeasurementKey,
  minutesToTime,
  nextEndTime,
  timeToMinutes
} = require("../src/planning/timeline-layout");

test("converts timeline times including 24:00", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("23:45"), 1425);
  assert.equal(timeToMinutes("24:00"), 1440);
  assert.equal(minutesToTime(1440), "24:00");
  assert.equal(nextEndTime("23:45"), "24:00");
});

test("normalizes timeline slot settings", () => {
  assert.equal(getSlotMinutes({ slotMinutes: 15 }), 15);
  assert.equal(getSlotMinutes({ slotMinutes: 90 }), 15);
  assert.equal(getSlotHeight({ slotHeight: 36 }), 36);
  assert.equal(getSlotHeight({ slotHeight: 12 }), 36);
});

test("extends timeline range to include late blocks ending at 24:00", () => {
  const range = getTimelineRange({ startTime: "09:00", endTime: "18:00" }, [
    { startTime: "22:00", endTime: "24:00" }
  ]);

  assert.deepEqual(range, { start: 540, end: 1440 });
});

test("uses measured component height when it exceeds the time-based height", () => {
  const block = { id: "block-a", startTime: "17:00", endTime: "17:30" };
  const state = { isEditing: true, isExpanded: false, linkedCount: 0, hasLinkableTasks: true };
  const key = makeTimelineMeasurementKey(block, state);
  const layouts = buildTimeBlockLayouts([block], {
    range: { start: 17 * 60, end: 18 * 60 },
    settings: { slotMinutes: 15, slotHeight: 36 },
    measuredHeights: new Map([[key, 180]]),
    getState: () => state
  });

  assert.equal(layouts[0].baseHeight, 72);
  assert.equal(layouts[0].height, 180);
  assert.equal(layouts[0].extraHeight, 108);
});

test("keeps time-based height when measured component is smaller", () => {
  const block = { id: "block-a", startTime: "17:00", endTime: "18:00" };
  const state = { isEditing: false, isExpanded: false, linkedCount: 0, hasLinkableTasks: false };
  const key = makeTimelineMeasurementKey(block, state);
  const layouts = buildTimeBlockLayouts([block], {
    range: { start: 17 * 60, end: 18 * 60 },
    settings: { slotMinutes: 15, slotHeight: 36 },
    measuredHeights: new Map([[key, 80]]),
    getState: () => state
  });

  assert.equal(layouts[0].baseHeight, 144);
  assert.equal(layouts[0].height, 144);
  assert.equal(layouts[0].extraHeight, 0);
});

test("pushes later grid lines down by earlier expanded blocks", () => {
  const layouts = [
    { end: 17 * 60 + 30, extraHeight: 108 },
    { end: 18 * 60, extraHeight: 0 }
  ];

  assert.equal(getExpandedOffsetBefore(17 * 60 + 15, layouts), 0);
  assert.equal(getExpandedOffsetBefore(17 * 60 + 30, layouts), 108);
  assert.equal(getExpandedOffsetBefore(18 * 60, layouts), 108);
});
