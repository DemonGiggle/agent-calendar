import { randomUUID } from "node:crypto";

import { loadCronStore, resolveCronStorePath, saveCronStore } from "openclaw/plugin-sdk/cron-store-runtime";
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { formatDateTimeLabel } from "../core/date-time.js";
import type { CalendarEntry } from "../core/types.js";
import { resolveOwnerScope } from "./context.js";

const MANAGED_TAG = "[managed-by=agent-calendar]";

export function buildReminderCronJob(params: {
  entry: CalendarEntry;
  toolContext: OpenClawPluginToolContext;
  timezone: string;
}): Record<string, unknown> {
  if (params.entry.reminderAtUtcMs == null) {
    throw new Error("Cannot schedule a reminder without reminderAtUtcMs.");
  }

  const scope = resolveOwnerScope(params.toolContext);
  if (!scope.deliveryTarget) {
    throw new Error("Reminder delivery requires an active channel target.");
  }

  const jobId = randomUUID();
  const createdAtMs = Date.now();
  const reminderLabel = params.entry.startUtcMs
    ? formatDateTimeLabel(params.entry.startUtcMs, params.timezone)
    : params.entry.localDate;
  const promptLines = [
    "You are sending a scheduled calendar reminder.",
    "Reply with one short mobile-friendly reminder message only.",
    `Title: ${params.entry.title}`,
    `When: ${reminderLabel}`,
    params.entry.memo ? `Memo: ${params.entry.memo}` : undefined,
    "Do not invent details or ask follow-up questions.",
  ].filter(Boolean);

  return {
    id: jobId,
    agentId: params.toolContext.agentId,
    sessionKey: params.toolContext.sessionKey,
    name: `Calendar reminder: ${params.entry.title}`,
    description: `${MANAGED_TAG} Reminder for calendar entry ${params.entry.id}`,
    enabled: true,
    deleteAfterRun: true,
    createdAtMs,
    updatedAtMs: createdAtMs,
    schedule: {
      kind: "at",
      at: new Date(params.entry.reminderAtUtcMs).toISOString(),
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: promptLines.join("\n"),
      lightContext: true,
    },
    delivery: {
      mode: "announce",
      channel: scope.deliveryTarget.channel,
      to: scope.deliveryTarget.to,
      accountId: scope.deliveryTarget.accountId,
      threadId: scope.deliveryTarget.threadId,
      bestEffort: true,
    },
    state: {
      nextRunAtMs: params.entry.reminderAtUtcMs,
    },
  };
}

export async function upsertReminder(params: {
  api: OpenClawPluginApi;
  entry: CalendarEntry;
  toolContext: OpenClawPluginToolContext;
  timezone: string;
}): Promise<CalendarEntry> {
  const storePath = resolveCronStorePath();
  const store = await loadCronStore(storePath);
  const filteredJobs = params.entry.reminderJobId
    ? store.jobs.filter((job) => job.id !== params.entry.reminderJobId)
    : [...store.jobs];

  if (params.entry.reminderAtUtcMs == null) {
    store.jobs = filteredJobs;
    await saveCronStore(storePath, store);
    params.api.runtime.system.requestHeartbeat({
      source: "hook",
      intent: "event",
      reason: "calendar reminder removed",
      agentId: params.toolContext.agentId,
      sessionKey: params.toolContext.sessionKey,
    });
    return {
      ...params.entry,
      reminderJobId: undefined,
    };
  }

  const job = buildReminderCronJob({
    entry: params.entry,
    toolContext: params.toolContext,
    timezone: params.timezone,
  });
  store.jobs = [...filteredJobs, job as never];
  await saveCronStore(storePath, store);
  params.api.runtime.system.requestHeartbeat({
    source: "hook",
    intent: "scheduled",
    reason: "calendar reminder updated",
    agentId: params.toolContext.agentId,
    sessionKey: params.toolContext.sessionKey,
  });
  return {
    ...params.entry,
    reminderJobId: String(job.id),
  };
}
