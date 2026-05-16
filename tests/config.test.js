import test from "node:test";
import assert from "node:assert/strict";

import {
  parsePluginConfig,
  resolveDatabasePath,
  resolvePluginStateDir,
  resolveSystemTimezone,
  validateTimezone,
} from "../dist/core/config.js";

test("parsePluginConfig defaults timezone to the current system timezone", () => {
  const result = parsePluginConfig({});

  assert.equal(result.defaultTimezone, resolveSystemTimezone());
  assert.equal(result.defaultEventReminderMinutesBefore, 10);
});

test("parsePluginConfig accepts explicit config and resolves database paths", () => {
  const result = parsePluginConfig({
    dbPath: "data/calendar.sqlite",
    defaultTimezone: "UTC",
    defaultAgendaLimit: 7,
    defaultEventReminderMinutesBefore: 15,
    detectionMode: "auto_save_high_confidence",
  });

  assert.equal(result.dbPath, "data/calendar.sqlite");
  assert.equal(result.defaultTimezone, "UTC");
  assert.equal(result.defaultAgendaLimit, 7);
  assert.equal(result.defaultEventReminderMinutesBefore, 15);
  assert.equal(result.detectionMode, "auto_save_high_confidence");
  assert.equal(
    resolveDatabasePath({
      configuredPath: result.dbPath,
      stateDir: "/tmp/agent-state",
    }),
    "/tmp/agent-state/data/calendar.sqlite",
  );
  assert.equal(
    resolveDatabasePath({
      configuredPath: "/var/lib/agent-calendar.sqlite",
      stateDir: "/tmp/agent-state",
    }),
    "/var/lib/agent-calendar.sqlite",
  );
});

test("parsePluginConfig validates timezones and falls back invalid optional values", () => {
  assert.throws(() => validateTimezone("Mars/Base"), /Invalid timezone/);

  const result = parsePluginConfig({
    defaultTimezone: "UTC",
    defaultAgendaLimit: 99,
    defaultEventReminderMinutesBefore: 5000,
    detectionMode: "not-a-mode",
  });

  assert.equal(result.defaultAgendaLimit, 5);
  assert.equal(result.defaultEventReminderMinutesBefore, 10);
  assert.equal(result.detectionMode, "confirm_first");
});

test("resolvePluginStateDir accepts multiple OpenClaw runtime shapes", () => {
  assert.equal(
    resolvePluginStateDir(
      {
        state: {
          resolveStateDir: () => "/tmp/runtime-state",
        },
      },
      "agent-calendar",
    ),
    "/tmp/runtime-state/agent-calendar",
  );

  assert.equal(
    resolvePluginStateDir(
      {
        resolveStateDir: () => "/tmp/direct-runtime-state",
      },
      "agent-calendar",
    ),
    "/tmp/direct-runtime-state/agent-calendar",
  );

  assert.equal(
    resolvePluginStateDir(
      {
        stateDir: "/tmp/string-runtime-state",
      },
      "agent-calendar",
    ),
    "/tmp/string-runtime-state/agent-calendar",
  );
});

test("resolvePluginStateDir throws a clear error when runtime has no state directory", () => {
  assert.throws(
    () => resolvePluginStateDir({}, "agent-calendar"),
    /did not expose a plugin state directory/,
  );
});
