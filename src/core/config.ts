import path from "node:path";

import type { DetectionMode } from "./types.js";

export interface CalendarPluginConfig {
  dbPath?: string;
  defaultTimezone: string;
  defaultAgendaLimit: number;
  detectionMode: DetectionMode;
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
      default: "UTC",
      description: "Default IANA timezone for parsing and formatting.",
    },
    defaultAgendaLimit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      default: 5,
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
  const defaultTimezone = validateTimezone(
    typeof input.defaultTimezone === "string" && input.defaultTimezone.trim().length > 0
      ? input.defaultTimezone.trim()
      : "UTC",
  );
  const defaultAgendaLimit =
    typeof input.defaultAgendaLimit === "number" &&
    Number.isInteger(input.defaultAgendaLimit) &&
    input.defaultAgendaLimit >= 1 &&
    input.defaultAgendaLimit <= 20
      ? input.defaultAgendaLimit
      : 5;
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

