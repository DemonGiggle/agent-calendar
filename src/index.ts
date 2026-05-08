import path from "node:path";

import { Type } from "@sinclair/typebox";
import {
  buildJsonPluginConfigSchema,
  definePluginEntry,
  jsonResult,
  readNumberParam,
  readStringParam,
} from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import {
  calendarPluginConfigJsonSchema,
  parsePluginConfig,
  resolveDatabasePath,
} from "./core/config.js";
import { SQLiteCalendarRepository } from "./core/repository.js";
import { CalendarService } from "./core/service.js";
import type { CalendarEntry, RecurrenceSpec } from "./core/types.js";
import {
  buildOwnerResolutionDebug,
  buildCalendarPromptGuidance,
  looksCalendarRelevant,
  resolveOwnerScope,
} from "./openclaw/context.js";
import { upsertReminder } from "./openclaw/reminders.js";
import { buildToolFailurePayload } from "./openclaw/tool-errors.js";

const PLUGIN_ID = "agent-calendar";
const TOOL_NAMES = [
  "cal_candidate_detect",
  "cal_entry_create",
  "cal_entry_update",
  "cal_entry_delete",
  "cal_agenda_upcoming",
  "cal_agenda_day",
  "cal_entry_search",
] as const;

function parseRecurrence(raw: unknown): RecurrenceSpec | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if (
    record.frequency !== "daily" &&
    record.frequency !== "weekly" &&
    record.frequency !== "monthly"
  ) {
    return undefined;
  }
  return {
    frequency: record.frequency,
    interval:
      typeof record.interval === "number" &&
      Number.isInteger(record.interval) &&
      record.interval >= 1
        ? record.interval
        : 1,
    untilDate:
      typeof record.untilDate === "string" && record.untilDate.trim().length > 0
        ? record.untilDate.trim()
        : undefined,
  };
}

function createCalendarTools(params: {
  toolContext: OpenClawPluginToolContext;
  service: CalendarService;
  api: Parameters<Parameters<typeof definePluginEntry>[0]["register"]>[0];
  defaultAgendaLimit: number;
  timezone: string;
  detectionMode: "confirm_first" | "auto_save_high_confidence";
  inboundContext?: {
    conversationId?: string;
    senderId?: string;
    deliveryTarget?: string;
    originatingTarget?: string;
  };
}): AnyAgentTool[] {
  const scope = resolveOwnerScope(params.toolContext, params.inboundContext);
  params.api.logger.info(
    `agent-calendar: resolved owner scope ${buildOwnerResolutionDebug({
      ownerKey: scope.ownerKey,
      toolContext: params.toolContext,
      inboundContext: params.inboundContext,
    })}`,
  );

  const failTool = (tool: string, step: string, error: unknown) => {
    const payload = buildToolFailurePayload({
      tool,
      step,
      error,
    });
    params.api.logger.error(`${payload.summary} [owner=${scope.ownerKey}]`);
    return jsonResult(payload);
  };

  const createToolResult = async (tool: string, entry: CalendarEntry) => {
    let nextEntry: CalendarEntry;
    try {
      nextEntry = await upsertReminder({
        api: params.api,
        entry,
        toolContext: params.toolContext,
        timezone: params.timezone,
      });
    } catch (error) {
      return failTool(tool, "schedule-reminder", error);
    }

    try {
      params.service.saveEntry(nextEntry);
    } catch (error) {
      return failTool(tool, "persist-entry", error);
    }

    return jsonResult({
      status: "ok",
      summary: `Saved ${nextEntry.kind} "${nextEntry.title}".`,
      entry: nextEntry,
    });
  };

  return [
    {
      name: "cal_candidate_detect",
      label: "Detect calendar candidate",
      description:
        "Inspect a raw user message for calendar-worthy dates, times, reminders, or events and return a structured candidate.",
      parameters: Type.Object({
        text: Type.String({ minLength: 1 }),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const text = readStringParam(rawParams as Record<string, unknown>, "text", { required: true });
          return jsonResult({
            status: "ok",
            candidate: params.service.detectCandidate(text),
            detectionMode: params.detectionMode,
            summary:
              "Use this result to confirm the calendar details before creating or updating an entry.",
          });
        } catch (error) {
          return failTool("cal_candidate_detect", "detect-candidate", error);
        }
      },
    },
    {
      name: "cal_entry_create",
      label: "Create calendar entry",
      description:
        "Create a calendar event or dated memo in the requester's scoped calendar. Use this after the date and title are clear.",
      parameters: Type.Object({
        kind: Type.Union([Type.Literal("event"), Type.Literal("memo")]),
        title: Type.String({ minLength: 1 }),
        memo: Type.Optional(Type.String()),
        date: Type.String({ description: "YYYY-MM-DD in the plugin timezone" }),
        time: Type.Optional(Type.String({ description: "HH:MM 24h time" })),
        endTime: Type.Optional(Type.String({ description: "HH:MM 24h time" })),
        allDay: Type.Optional(Type.Boolean()),
        recurrence: Type.Optional(
          Type.Object({
            frequency: Type.Union([
              Type.Literal("daily"),
              Type.Literal("weekly"),
              Type.Literal("monthly"),
            ]),
            interval: Type.Optional(Type.Integer({ minimum: 1 })),
            untilDate: Type.Optional(Type.String()),
          }),
        ),
        reminderAt: Type.Optional(Type.String({ description: "Absolute ISO timestamp" })),
        reminderMinutesBefore: Type.Optional(Type.Integer({ minimum: 0 })),
        source: Type.Optional(Type.Union([Type.Literal("manual"), Type.Literal("detected")])),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const paramsRecord = rawParams as Record<string, unknown>;
          const entry = params.service.createEntry({
            ownerKey: scope.ownerKey,
            kind: readStringParam(paramsRecord, "kind", { required: true }) as "event" | "memo",
            title: readStringParam(paramsRecord, "title", { required: true }),
            memo: readStringParam(paramsRecord, "memo"),
            date: readStringParam(paramsRecord, "date", { required: true }),
            time: readStringParam(paramsRecord, "time"),
            endTime: readStringParam(paramsRecord, "endTime"),
            allDay: paramsRecord.allDay === true,
            recurrence: parseRecurrence(paramsRecord.recurrence),
            reminderAt: readStringParam(paramsRecord, "reminderAt"),
            reminderMinutesBefore: readNumberParam(paramsRecord, "reminderMinutesBefore", {
              integer: true,
            }),
            source:
              readStringParam(paramsRecord, "source") === "detected" ? "detected" : "manual",
          });
          return createToolResult("cal_entry_create", entry);
        } catch (error) {
          return failTool("cal_entry_create", "create-entry", error);
        }
      },
    },
    {
      name: "cal_entry_update",
      label: "Update calendar entry",
      description:
        "Update an existing calendar entry in the requester's scoped calendar, including reminder details or recurrence.",
      parameters: Type.Object({
        entryId: Type.String({ minLength: 1 }),
        title: Type.Optional(Type.String()),
        memo: Type.Optional(Type.String()),
        date: Type.Optional(Type.String()),
        time: Type.Optional(Type.String()),
        endTime: Type.Optional(Type.String()),
        allDay: Type.Optional(Type.Boolean()),
        recurrence: Type.Optional(
          Type.Union([
            Type.Null(),
            Type.Object({
              frequency: Type.Union([
                Type.Literal("daily"),
                Type.Literal("weekly"),
                Type.Literal("monthly"),
              ]),
              interval: Type.Optional(Type.Integer({ minimum: 1 })),
              untilDate: Type.Optional(Type.String()),
            }),
          ]),
        ),
        reminderAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        reminderMinutesBefore: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
        clearReminder: Type.Optional(Type.Boolean()),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const paramsRecord = rawParams as Record<string, unknown>;
          const updated = params.service.updateEntry({
            ownerKey: scope.ownerKey,
            entryId: readStringParam(paramsRecord, "entryId", { required: true }),
            title: readStringParam(paramsRecord, "title"),
            memo: readStringParam(paramsRecord, "memo"),
            date: readStringParam(paramsRecord, "date"),
            time: readStringParam(paramsRecord, "time"),
            endTime: readStringParam(paramsRecord, "endTime"),
            allDay: typeof paramsRecord.allDay === "boolean" ? paramsRecord.allDay : undefined,
            recurrence:
              paramsRecord.recurrence === null
                ? null
                : parseRecurrence(paramsRecord.recurrence),
            reminderAt:
              paramsRecord.reminderAt === null
                ? null
                : readStringParam(paramsRecord, "reminderAt"),
            reminderMinutesBefore:
              paramsRecord.reminderMinutesBefore === null
                ? null
                : readNumberParam(paramsRecord, "reminderMinutesBefore", { integer: true }),
            clearReminder: paramsRecord.clearReminder === true,
          });
          return createToolResult("cal_entry_update", updated);
        } catch (error) {
          return failTool("cal_entry_update", "update-entry", error);
        }
      },
    },
    {
      name: "cal_entry_delete",
      label: "Delete calendar entry",
      description:
        "Cancel a calendar entry in the requester's scoped calendar. Use after confirmation for destructive actions.",
      parameters: Type.Object({
        entryId: Type.String({ minLength: 1 }),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const entryId = readStringParam(rawParams as Record<string, unknown>, "entryId", {
            required: true,
          });
          const deleted = params.service.deleteEntry(scope.ownerKey, entryId);

          let cleared: CalendarEntry;
          try {
            cleared = await upsertReminder({
              api: params.api,
              entry: { ...deleted, reminderAtUtcMs: undefined },
              toolContext: params.toolContext,
              timezone: params.timezone,
            });
          } catch (error) {
            return failTool("cal_entry_delete", "clear-reminder", error);
          }

          try {
            params.service.saveEntry(cleared);
          } catch (error) {
            return failTool("cal_entry_delete", "persist-entry", error);
          }

          return jsonResult({
            status: "ok",
            summary: `Cancelled "${deleted.title}".`,
            entry: cleared,
          });
        } catch (error) {
          return failTool("cal_entry_delete", "delete-entry", error);
        }
      },
    },
    {
      name: "cal_agenda_upcoming",
      label: "Show upcoming agenda",
      description:
        "Show the next few upcoming events in a compact mobile-friendly agenda format for the requester's scoped calendar.",
      parameters: Type.Object({
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const limit =
            readNumberParam(rawParams as Record<string, unknown>, "limit", { integer: true }) ??
            params.defaultAgendaLimit;
          const result = params.service.listUpcoming(scope.ownerKey, limit);
          return jsonResult({
            status: "ok",
            summary: result.text,
            text: result.text,
            occurrences: result.occurrences,
          });
        } catch (error) {
          return failTool("cal_agenda_upcoming", "list-upcoming", error);
        }
      },
    },
    {
      name: "cal_agenda_day",
      label: "Show daily agenda",
      description:
        "Show the agenda for a single YYYY-MM-DD date in a compact mobile-friendly format for the requester's scoped calendar.",
      parameters: Type.Object({
        date: Type.String({ minLength: 1 }),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const date = readStringParam(rawParams as Record<string, unknown>, "date", { required: true });
          const result = params.service.listAgendaForDate(scope.ownerKey, date);
          return jsonResult({
            status: "ok",
            summary: result.text,
            text: result.text,
            occurrences: result.occurrences,
          });
        } catch (error) {
          return failTool("cal_agenda_day", "list-day", error);
        }
      },
    },
    {
      name: "cal_entry_search",
      label: "Search calendar entries",
      description:
        "Search calendar entries by text and optional date range in the requester's scoped calendar.",
      parameters: Type.Object({
        query: Type.Optional(Type.String()),
        dateFrom: Type.Optional(Type.String()),
        dateTo: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      async execute(_toolCallId, rawParams) {
        try {
          const paramsRecord = rawParams as Record<string, unknown>;
          const limit = readNumberParam(paramsRecord, "limit", { integer: true }) ?? 10;
          const result = params.service.searchEntries({
            ownerKey: scope.ownerKey,
            query: readStringParam(paramsRecord, "query"),
            dateFrom: readStringParam(paramsRecord, "dateFrom"),
            dateTo: readStringParam(paramsRecord, "dateTo"),
            limit,
          });
          return jsonResult({
            status: "ok",
            summary: result.text,
            text: result.text,
            entries: result.entries,
          });
        } catch (error) {
          return failTool("cal_entry_search", "search-entries", error);
        }
      },
    },
  ];
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Agent Calendar",
  description:
    "Scoped calendar plugin with reusable core modules, upcoming agenda views, reminders, and event detection guidance.",
  configSchema: buildJsonPluginConfigSchema(calendarPluginConfigJsonSchema),
  register(api) {
    const pluginConfig = parsePluginConfig(api.pluginConfig);
    const inboundOwnerContexts = new Map<
      string,
      {
        conversationId?: string;
        senderId?: string;
        deliveryTarget?: string;
        originatingTarget?: string;
      }
    >();
    const stateDir = path.join(api.runtime.state.resolveStateDir(), PLUGIN_ID);
    const repository = new SQLiteCalendarRepository(
      resolveDatabasePath({
        configuredPath: pluginConfig.dbPath,
        stateDir,
      }),
    );
    const service = new CalendarService(
      repository,
      pluginConfig.defaultTimezone,
      pluginConfig.defaultAgendaLimit,
    );

    api.on("before_prompt_build", (event) => {
      if (!looksCalendarRelevant(event.prompt)) {
        return;
      }

      return {
        appendSystemContext: buildCalendarPromptGuidance({
          detectionMode: pluginConfig.detectionMode,
        }),
        prependContext:
          "Calendar cue: the latest user message appears calendar-related. Keep extraction compact and confirm destructive or inferred changes.",
      };
    });

    api.on("message_received", (event, ctx) => {
      if (!ctx.sessionKey) {
        return;
      }

      const metadata = event.metadata as Record<string, unknown> | undefined;
      const deliveryTarget =
        typeof metadata?.to === "string" && metadata.to.trim().length > 0
          ? metadata.to
          : undefined;
      const originatingTarget =
        typeof metadata?.originatingTo === "string" && metadata.originatingTo.trim().length > 0
          ? metadata.originatingTo
          : undefined;

      inboundOwnerContexts.set(ctx.sessionKey, {
        conversationId: ctx.conversationId,
        senderId: ctx.senderId ?? event.senderId,
        deliveryTarget,
        originatingTarget,
      });

      api.logger.debug?.(
        `agent-calendar: captured inbound owner context sessionKey=${ctx.sessionKey} conversationId=${ctx.conversationId ?? "none"} senderId=${ctx.senderId ?? event.senderId ?? "none"} originatingTo=${originatingTarget ?? "none"} to=${deliveryTarget ?? "none"}`,
      );
    });

    api.registerTool(
      (toolContext) =>
        createCalendarTools({
          toolContext,
          service,
          api,
          defaultAgendaLimit: pluginConfig.defaultAgendaLimit,
          timezone: pluginConfig.defaultTimezone,
          detectionMode: pluginConfig.detectionMode,
          inboundContext:
            toolContext.sessionKey != null
              ? inboundOwnerContexts.get(toolContext.sessionKey)
              : undefined,
        }),
      { names: [...TOOL_NAMES] },
    );
  },
});
