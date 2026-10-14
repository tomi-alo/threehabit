import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allDoneToday,
  capMessage,
  isHabitSelected,
  localDay,
  missNote,
  nextPosition,
  normalizeHabitName,
  previousDay,
} from "./habits.ts";

describe("habit cap", () => {
  it("gives the first open position", () => {
    assert.equal(nextPosition([]), 1);
    assert.equal(nextPosition([1]), 2);
    assert.equal(nextPosition([1, 3]), 2);
  });

  it("refuses a fourth habit", () => {
    assert.equal(nextPosition([1, 2, 3]), null);
    assert.match(capMessage(3) ?? "", /Three habits/);
    assert.equal(capMessage(2), null);
  });
});

describe("today", () => {
  it("marks the day done only when every habit is done", () => {
    assert.equal(allDoneToday(0, []), false);
    assert.equal(allDoneToday(2, [{ status: "done" }]), false);
    assert.equal(
      allDoneToday(2, [{ status: "done" }, { status: "missed" }]),
      false,
    );
    assert.equal(
      allDoneToday(2, [{ status: "done" }, { status: "done" }]),
      true,
    );
  });

  it("formats the local calendar day", () => {
    assert.equal(localDay(new Date(2026, 9, 14)), "2026-10-14");
  });

  it("finds the previous calendar day across month and year boundaries", () => {
    assert.equal(previousDay("2026-10-14"), "2026-10-13");
    assert.equal(previousDay("2026-01-01"), "2025-12-31");
  });
});

describe("daily selections", () => {
  it("recognizes a habit already selected today", () => {
    assert.equal(isHabitSelected(["walk", "read"], "walk"), true);
    assert.equal(isHabitSelected(["walk", "read"], "sleep"), false);
  });

  it("normalizes typed names so they can reuse an existing habit", () => {
    assert.equal(normalizeHabitName("  Morning Walk "), "morning walk");
    assert.equal(normalizeHabitName("MORNING WALK"), "morning walk");
  });
});

describe("miss note", () => {
  it("keeps a trimmed note", () => {
    assert.equal(missNote("  overslept  "), "overslept");
  });

  it("rejects a blank note", () => {
    assert.throws(() => missNote("   "), /what got in the way/);
  });
});
