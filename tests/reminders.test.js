import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderCronJob } from "../dist/openclaw/reminders.js";

test("buildReminderCronJob creates an announce delivery job", () => {
  const job = buildReminderCronJob({
    entry: {
      id: "entry-1",
      ownerKey: "sender:telegram:default:alice",
      kind: "event",
      title: "Project sync",
      localDate: "2026-05-10",
      allDay: false,
      startUtcMs: Date.parse("2026-05-10T09:00:00Z"),
      reminderAtUtcMs: Date.parse("2026-05-10T08:30:00Z"),
      source: "manual",
      status: "active",
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    toolContext: {
      agentId: "assistant",
      sessionKey: "session-1",
      messageChannel: "telegram",
      requesterSenderId: "alice",
      deliveryContext: {
        channel: "telegram",
        to: "chat-1",
      },
    },
    timezone: "UTC",
  });

  assert.equal(job.sessionTarget, "isolated");
  assert.equal(job.delivery.mode, "announce");
  assert.equal(job.payload.kind, "agentTurn");
});
