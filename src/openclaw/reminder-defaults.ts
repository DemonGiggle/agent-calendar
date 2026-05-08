import type { CalendarEntry } from "../core/types.js";

export function resolveCreateReminderMinutesBefore(params: {
  kind: CalendarEntry["kind"];
  time?: string;
  allDay?: boolean;
  reminderAt?: string;
  reminderMinutesBefore?: number;
  defaultEventReminderMinutesBefore: number;
}): number | undefined {
  if (params.reminderAt != null || params.reminderMinutesBefore != null) {
    return params.reminderMinutesBefore;
  }

  const isTimedEvent =
    params.kind === "event" &&
    params.allDay !== true &&
    typeof params.time === "string" &&
    params.time.trim().length > 0;
  return isTimedEvent ? params.defaultEventReminderMinutesBefore : undefined;
}

export function resolveUpdateReminderMinutesBefore(params: {
  existing: CalendarEntry;
  time?: string;
  allDay?: boolean;
  reminderAt?: string | null;
  reminderMinutesBefore?: number | null;
  clearReminder?: boolean;
  defaultEventReminderMinutesBefore: number;
}): number | null | undefined {
  if (params.clearReminder === true || params.reminderAt !== undefined || params.reminderMinutesBefore !== undefined) {
    return params.reminderMinutesBefore;
  }

  const effectiveAllDay = params.allDay ?? params.existing.allDay;
  const effectiveHasTime =
    params.time !== undefined ? params.time.trim().length > 0 : params.existing.startUtcMs != null;
  const isTimedEvent = params.existing.kind === "event" && !effectiveAllDay && effectiveHasTime;
  if (!isTimedEvent || params.existing.reminderAtUtcMs != null) {
    return undefined;
  }

  return params.defaultEventReminderMinutesBefore;
}
