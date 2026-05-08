import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCreateReminderMinutesBefore,
  resolveUpdateReminderMinutesBefore,
} from "../dist/openclaw/reminder-defaults.js";

test("resolveCreateReminderMinutesBefore defaults timed events to the configured lead time", () => {
  assert.equal(
    resolveCreateReminderMinutesBefore({
      kind: "event",
      time: "09:00",
      defaultEventReminderMinutesBefore: 10,
    }),
    10,
  );
});

test("resolveCreateReminderMinutesBefore respects explicit or non-timed inputs", () => {
  assert.equal(
    resolveCreateReminderMinutesBefore({
      kind: "event",
      time: "09:00",
      reminderMinutesBefore: 25,
      defaultEventReminderMinutesBefore: 10,
    }),
    25,
  );
  assert.equal(
    resolveCreateReminderMinutesBefore({
      kind: "memo",
      defaultEventReminderMinutesBefore: 10,
    }),
    undefined,
  );
  assert.equal(
    resolveCreateReminderMinutesBefore({
      kind: "event",
      allDay: true,
      defaultEventReminderMinutesBefore: 10,
    }),
    undefined,
  );
});

test("resolveUpdateReminderMinutesBefore defaults newly-timed events without reminders", () => {
  assert.equal(
    resolveUpdateReminderMinutesBefore({
      existing: {
        id: "entry-1",
        ownerKey: "sender:telegram:default:alice",
        kind: "event",
        title: "Project sync",
        localDate: "2026-05-10",
        allDay: false,
        startUtcMs: Date.parse("2026-05-10T09:00:00Z"),
        source: "manual",
        status: "active",
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      defaultEventReminderMinutesBefore: 10,
    }),
    10,
  );
});

test("resolveUpdateReminderMinutesBefore preserves explicit reminder choices and existing reminders", () => {
  assert.equal(
    resolveUpdateReminderMinutesBefore({
      existing: {
        id: "entry-1",
        ownerKey: "sender:telegram:default:alice",
        kind: "event",
        title: "Project sync",
        localDate: "2026-05-10",
        allDay: false,
        startUtcMs: Date.parse("2026-05-10T09:00:00Z"),
        reminderAtUtcMs: Date.parse("2026-05-10T08:50:00Z"),
        source: "manual",
        status: "active",
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      defaultEventReminderMinutesBefore: 10,
    }),
    undefined,
  );
  assert.equal(
    resolveUpdateReminderMinutesBefore({
      existing: {
        id: "entry-2",
        ownerKey: "sender:telegram:default:alice",
        kind: "event",
        title: "Project sync",
        localDate: "2026-05-10",
        allDay: false,
        startUtcMs: Date.parse("2026-05-10T09:00:00Z"),
        source: "manual",
        status: "active",
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      reminderMinutesBefore: null,
      clearReminder: true,
      defaultEventReminderMinutesBefore: 10,
    }),
    null,
  );
});
