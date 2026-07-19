import test from "node:test";
import assert from "node:assert/strict";
import { checkoutWindowState, timeToSeconds } from "./attendanceWindow.js";

test("parses database time values", () => {
  assert.equal(timeToSeconds("16:30:00"), 16 * 3600 + 30 * 60);
  assert.equal(timeToSeconds("18:00"), 18 * 3600);
  assert.equal(timeToSeconds("18:00:30"), 18 * 3600 + 30);
  assert.equal(timeToSeconds("not-a-time"), null);
});

test("keeps the checkout window closed before the employee start time", () => {
  const state = checkoutWindowState({
    checkoutFrom: "16:30:00",
    checkoutTo: "18:00:00",
    now: new Date("2026-07-19T13:29:00Z"), // 16:29 in Cairo (UTC+3)
  });
  assert.deepEqual(state, { configured: true, open: false, beforeOpen: true, afterClose: false });
});

test("opens at the start and closes after the end", () => {
  assert.equal(checkoutWindowState({
    checkoutFrom: "16:30",
    checkoutTo: "18:00",
    now: new Date("2026-07-19T13:30:00Z"),
  }).open, true);
  assert.equal(checkoutWindowState({
    checkoutFrom: "16:30",
    checkoutTo: "18:00",
    now: new Date("2026-07-19T15:00:00Z"),
  }).open, true);
  assert.equal(checkoutWindowState({
    checkoutFrom: "16:30",
    checkoutTo: "18:00",
    now: new Date("2026-07-19T15:01:00Z"),
  }).afterClose, true);
});

test("closes immediately after the exact checkout end second", () => {
  assert.equal(checkoutWindowState({
    checkoutFrom: "16:30:00",
    checkoutTo: "18:00:00",
    now: new Date("2026-07-19T15:00:00.500Z"),
  }).afterClose, true);
});

test("fails closed when the schedule is incomplete", () => {
  assert.deepEqual(
    checkoutWindowState({ checkoutFrom: "16:30", checkoutTo: null }),
    { configured: false, open: false, beforeOpen: false, afterClose: false },
  );
});

test("fails closed for unsupported overnight schedules", () => {
  assert.equal(checkoutWindowState({ checkoutFrom: "22:00", checkoutTo: "02:00" }).configured, false);
});
