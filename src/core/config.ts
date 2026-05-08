import path from "node:path";

import type { DetectionMode } from "./types.js";

export interface CalendarPluginConfig {
  dbPath?: string;
  defaultTimezone: string;
  defaultAgendaLimit: number;
  defaultEventReminderMinutesBefore: number;
  detectionMode: DetectionMode;
}

export function resolveSystemTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === "string" && resolved.trim().length > 0 ? resolved : "UTC";
}

export const calendarPluginConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    dbPath: {
      type: "string",
      description: "Optional path to the SQLite database file.",
    },
    defaultTimezone: {
      type: "string",
      description: "Default IANA timezone for parsing and formatting. If omitted, the current system timezone is used.",
    },
    defaultAgendaLimit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      default: 5,
    },
    defaultEventReminderMinutesBefore: {
      type: "integer",
      minimum: 0,
      maximum: 1440,
      default: 10,
      description: "Default reminder lead time for timed events when the tool caller does not specify a reminder.",
    },
    detectionMode: {
      type: "string",
      enum: ["confirm_first", "auto_save_high_confidence"],
      default: "confirm_first",
    },
  },
} as const;

export function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

export function parsePluginConfig(raw: unknown): CalendarPluginConfig {
  const input = (raw ?? {}) as Record<string, unknown>;
  const systemTimezone = resolveSystemTimezone();
  const defaultTimezone = validateTimezone(
    typeof input.defaultTimezone === "string" && input.defaultTimezone.trim().length > 0
      ? input.defaultTimezone.trim()
      : systemTimezone,
  );
  const defaultAgendaLimit =
    typeof input.defaultAgendaLimit === "number" &&
    Number.isInteger(input.defaultAgendaLimit) &&
    input.defaultAgendaLimit >= 1 &&
    input.defaultAgendaLimit <= 20
      ? input.defaultAgendaLimit
      : 5;
  const defaultEventReminderMinutesBefore =
    typeof input.defaultEventReminderMinutesBefore === "number" &&
    Number.isInteger(input.defaultEventReminderMinutesBefore) &&
    input.defaultEventReminderMinutesBefore >= 0 &&
    input.defaultEventReminderMinutesBefore <= 1440
      ? input.defaultEventReminderMinutesBefore
      : 10;
  const detectionMode =
    input.detectionMode === "auto_save_high_confidence"
      ? "auto_save_high_confidence"
      : "confirm_first";

  return {
    dbPath:
      typeof input.dbPath === "string" && input.dbPath.trim().length > 0
        ? input.dbPath.trim()
        : undefined,
    defaultTimezone,
    defaultAgendaLimit,
    defaultEventReminderMinutesBefore,
    detectionMode,
  };
}

export function resolveDatabasePath(params: {
  configuredPath?: string;
  stateDir: string;
}): string {
  if (params.configuredPath) {
    return path.isAbsolute(params.configuredPath)
      ? params.configuredPath
      : path.join(params.stateDir, params.configuredPath);
  }

  return path.join(params.stateDir, "agent-calendar.sqlite");
}
