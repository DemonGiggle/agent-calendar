import { randomUUID } from "node:crypto";

import {
  addDays,
  addMonths,
  compareDateKeys,
  isValidDateKey,
  isValidTimeKey,
  utcMsToDateKey,
  utcMsToTimeKey,
  zonedDateTimeToUtcMs,
} from "./date-time.js";
import { detectCandidateFromText } from "./detection.js";
import { formatAgendaText, formatEntrySummary } from "./format.js";
import { SQLiteCalendarRepository } from "./repository.js";
import type {
  AgendaOccurrence,
  CalendarEntry,
  CreateEntryInput,
  SearchEntriesInput,
  UpdateEntryInput,
} from "./types.js";

const MAX_EXPANDED_OCCURRENCES = 512;

function assertDate(date: string): void {
  if (!isValidDateKey(date)) {
    throw new Error(`Invalid date: ${date}`);
  }
}

function normalizeRecurrence(
  recurrence: CreateEntryInput["recurrence"] | UpdateEntryInput["recurrence"],
): CalendarEntry["recurrence"] {
  if (recurrence == null) {
    return recurrence === null ? undefined : undefined;
  }
  if (recurrence.interval < 1) {
    throw new Error("Recurrence interval must be at least 1.");
  }
  if (recurrence.untilDate) {
    assertDate(recurrence.untilDate);
  }
  return recurrence;
}

function computeReminderAtUtcMs(params: {
  date: string;
  time?: string;
  allDay: boolean;
  reminderAt?: string;
  reminderMinutesBefore?: number;
  timeZone: string;
}): number | undefined {
  if (params.reminderAt) {
    const timestamp = Date.parse(params.reminderAt);
    if (Number.isNaN(timestamp)) {
      throw new Error(`Invalid reminderAt value: ${params.reminderAt}`);
    }
    return timestamp;
  }

  if (params.reminderMinutesBefore == null) {
    return undefined;
  }

  if (params.allDay || !params.time) {
    const startOfDayUtc = zonedDateTimeToUtcMs(params.date, "09:00", params.timeZone);
    return startOfDayUtc - params.reminderMinutesBefore * 60_000;
  }

  return zonedDateTimeToUtcMs(params.date, params.time, params.timeZone) - params.reminderMinutesBefore * 60_000;
}

function toOccurrence(entry: CalendarEntry, localDate: string, timeZone: string): AgendaOccurrence {
  const baseTime = entry.startUtcMs != null ? utcMsToTimeKey(entry.startUtcMs, timeZone) : undefined;
  const durationMs =
    entry.startUtcMs != null && entry.endUtcMs != null ? entry.endUtcMs - entry.startUtcMs : undefined;
  const startUtcMs =
    entry.allDay || baseTime == null ? undefined : zonedDateTimeToUtcMs(localDate, baseTime, timeZone);
  return {
    occurrenceId: `${entry.id}:${localDate}`,
    entryId: entry.id,
    kind: entry.kind,
    title: entry.title,
    memo: entry.memo,
    localDate,
    allDay: entry.allDay,
    startUtcMs,
    endUtcMs: startUtcMs != null && durationMs != null ? startUtcMs + durationMs : undefined,
    reminderAtUtcMs: entry.reminderAtUtcMs,
    source: entry.source,
    recurrence: entry.recurrence,
  };
}

function expandOccurrences(params: {
  entries: CalendarEntry[];
  timeZone: string;
  dateFrom: string;
  dateTo: string;
  limit?: number;
}): AgendaOccurrence[] {
  const occurrences: AgendaOccurrence[] = [];

  for (const entry of params.entries) {
    if (!entry.recurrence) {
      if (
        compareDateKeys(entry.localDate, params.dateFrom) >= 0 &&
        compareDateKeys(entry.localDate, params.dateTo) <= 0
      ) {
        occurrences.push(toOccurrence(entry, entry.localDate, params.timeZone));
      }
      continue;
    }

    let currentDate = entry.localDate;
    let emitted = 0;
    while (currentDate !== "" && emitted < MAX_EXPANDED_OCCURRENCES) {
      if (
        compareDateKeys(currentDate, params.dateFrom) >= 0 &&
        compareDateKeys(currentDate, params.dateTo) <= 0
      ) {
        occurrences.push(toOccurrence(entry, currentDate, params.timeZone));
      }
      emitted += 1;
      if (entry.recurrence.untilDate && compareDateKeys(currentDate, entry.recurrence.untilDate) >= 0) {
        break;
      }
      currentDate =
        entry.recurrence.frequency === "daily"
          ? addDays(currentDate, entry.recurrence.interval)
          : entry.recurrence.frequency === "weekly"
            ? addDays(currentDate, entry.recurrence.interval * 7)
            : addMonths(currentDate, entry.recurrence.interval);
      if (currentDate !== "" && compareDateKeys(currentDate, params.dateTo) > 0) {
        break;
      }
    }
  }

  occurrences.sort((left, right) => {
    if (left.startUtcMs != null && right.startUtcMs != null) {
      return left.startUtcMs - right.startUtcMs;
    }
    if (left.localDate !== right.localDate) {
      return left.localDate.localeCompare(right.localDate);
    }
    return left.title.localeCompare(right.title);
  });

  return params.limit ? occurrences.slice(0, params.limit) : occurrences;
}

export class CalendarService {
  constructor(
    private readonly repository: SQLiteCalendarRepository,
    private readonly timeZone: string,
    private readonly defaultAgendaLimit: number,
  ) {}

  detectCandidate(text: string, nowMs?: number) {
    return detectCandidateFromText({
      text,
      nowMs,
      timeZone: this.timeZone,
      confirmFirst: true,
    });
  }

  createEntry(input: CreateEntryInput): CalendarEntry {
    assertDate(input.date);
    if (!input.title.trim()) {
      throw new Error("Title is required.");
    }
    const allDay = input.allDay ?? !input.time;
    if (input.time && !isValidTimeKey(input.time)) {
      throw new Error(`Invalid time: ${input.time}`);
    }
    if (input.endTime && !isValidTimeKey(input.endTime)) {
      throw new Error(`Invalid endTime: ${input.endTime}`);
    }
    const nowMs = Date.now();
    const startUtcMs =
      !allDay && input.time ? zonedDateTimeToUtcMs(input.date, input.time, this.timeZone) : undefined;
    const endUtcMs =
      !allDay && input.time && input.endTime
        ? zonedDateTimeToUtcMs(input.date, input.endTime, this.timeZone)
        : undefined;
    if (startUtcMs != null && endUtcMs != null && endUtcMs <= startUtcMs) {
      throw new Error("endTime must be after time.");
    }
    const entry: CalendarEntry = {
      id: randomUUID(),
      ownerKey: input.ownerKey,
      kind: input.kind,
      title: input.title.trim(),
      memo: input.memo?.trim() || undefined,
      localDate: input.date,
      allDay,
      startUtcMs,
      endUtcMs,
      recurrence: normalizeRecurrence(input.recurrence),
      reminderAtUtcMs: computeReminderAtUtcMs({
        date: input.date,
        time: input.time,
        allDay,
        reminderAt: input.reminderAt,
        reminderMinutesBefore: input.reminderMinutesBefore,
        timeZone: this.timeZone,
      }),
      source: input.source ?? "manual",
      status: "active",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    return this.repository.createEntry(entry);
  }

  updateEntry(input: UpdateEntryInput): CalendarEntry {
    const existing = this.repository.getEntry(input.ownerKey, input.entryId);
    if (!existing) {
      throw new Error(`Entry not found: ${input.entryId}`);
    }

    const date = input.date ?? existing.localDate;
    assertDate(date);
    const allDay = input.allDay ?? existing.allDay;
    const time = input.time ?? (existing.startUtcMs != null ? utcMsToTimeKey(existing.startUtcMs, this.timeZone) : undefined);
    const endTime =
      input.endTime ??
      (existing.endUtcMs != null ? utcMsToTimeKey(existing.endUtcMs, this.timeZone) : undefined);
    if (time && !isValidTimeKey(time)) {
      throw new Error(`Invalid time: ${time}`);
    }
    if (endTime && !isValidTimeKey(endTime)) {
      throw new Error(`Invalid endTime: ${endTime}`);
    }

    const startUtcMs = !allDay && time ? zonedDateTimeToUtcMs(date, time, this.timeZone) : undefined;
    const nextEndUtcMs = !allDay && time && endTime ? zonedDateTimeToUtcMs(date, endTime, this.timeZone) : undefined;
    if (startUtcMs != null && nextEndUtcMs != null && nextEndUtcMs <= startUtcMs) {
      throw new Error("endTime must be after time.");
    }

    const updated: CalendarEntry = {
      ...existing,
      title: input.title?.trim() || existing.title,
      memo: input.memo != null ? input.memo.trim() || undefined : existing.memo,
      localDate: date,
      allDay,
      startUtcMs,
      endUtcMs: nextEndUtcMs,
      recurrence:
        input.recurrence === null ? undefined : normalizeRecurrence(input.recurrence ?? existing.recurrence),
      reminderAtUtcMs: input.clearReminder
        ? undefined
        : computeReminderAtUtcMs({
            date,
            time,
            allDay,
            reminderAt:
              input.reminderAt === null
                ? undefined
                : input.reminderAt ?? (existing.reminderAtUtcMs != null ? new Date(existing.reminderAtUtcMs).toISOString() : undefined),
            reminderMinutesBefore:
              input.reminderMinutesBefore === null
                ? undefined
                : input.reminderMinutesBefore,
            timeZone: this.timeZone,
          }),
      reminderJobId: existing.reminderJobId,
      status: input.status ?? existing.status,
      updatedAtMs: Date.now(),
    };

    return this.repository.updateEntry(updated);
  }

  deleteEntry(ownerKey: string, entryId: string): CalendarEntry {
    const existing = this.repository.getEntry(ownerKey, entryId);
    if (!existing) {
      throw new Error(`Entry not found: ${entryId}`);
    }
    const deleted = {
      ...existing,
      status: "cancelled" as const,
      updatedAtMs: Date.now(),
    };
    return this.repository.updateEntry(deleted);
  }

  listUpcoming(ownerKey: string, limit?: number, nowMs?: number) {
    const now = nowMs ?? Date.now();
    const dateFrom = utcMsToDateKey(now, this.timeZone);
    const dateTo = addDays(dateFrom, 120);
    const occurrences = expandOccurrences({
      entries: this.repository.listActiveEntries(ownerKey),
      timeZone: this.timeZone,
      dateFrom,
      dateTo,
      limit: limit ?? this.defaultAgendaLimit,
    }).filter((occurrence) => occurrence.allDay || occurrence.startUtcMs == null || occurrence.startUtcMs >= now);
    return {
      occurrences,
      text: formatAgendaText({
        title: `Upcoming (${occurrences.length})`,
        occurrences,
        timeZone: this.timeZone,
      }),
    };
  }

  listAgendaForDate(ownerKey: string, date: string) {
    assertDate(date);
    const occurrences = expandOccurrences({
      entries: this.repository.listActiveEntries(ownerKey),
      timeZone: this.timeZone,
      dateFrom: date,
      dateTo: date,
    });
    return {
      occurrences,
      text: formatAgendaText({
        title: `Agenda for ${date}`,
        occurrences,
        timeZone: this.timeZone,
      }),
    };
  }

  searchEntries(input: SearchEntriesInput) {
    const entries = this.repository.searchEntries(input);
    return {
      entries,
      text:
        entries.length === 0
          ? "No matching calendar entries found."
          : ["Matches", ...entries.map((entry) => `• ${formatEntrySummary(entry, this.timeZone)}`)].join("\n"),
    };
  }

  getEntry(ownerKey: string, entryId: string): CalendarEntry | undefined {
    return this.repository.getEntry(ownerKey, entryId);
  }

  saveEntry(entry: CalendarEntry): CalendarEntry {
    return this.repository.updateEntry(entry);
  }
}

