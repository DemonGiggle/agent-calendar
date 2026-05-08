export type EntryKind = "event" | "memo";
export type EntryStatus = "active" | "cancelled";
export type EntrySource = "manual" | "detected";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
export type DetectionMode = "confirm_first" | "auto_save_high_confidence";
export type DetectionConfidence = "none" | "low" | "medium" | "high";

export interface RecurrenceSpec {
  frequency: RecurrenceFrequency;
  interval: number;
  untilDate?: string;
}

export interface CalendarEntry {
  id: string;
  ownerKey: string;
  kind: EntryKind;
  title: string;
  memo?: string;
  localDate: string;
  allDay: boolean;
  startUtcMs?: number;
  endUtcMs?: number;
  recurrence?: RecurrenceSpec;
  reminderAtUtcMs?: number;
  reminderJobId?: string;
  source: EntrySource;
  status: EntryStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AgendaOccurrence {
  occurrenceId: string;
  entryId: string;
  kind: EntryKind;
  title: string;
  memo?: string;
  localDate: string;
  allDay: boolean;
  startUtcMs?: number;
  endUtcMs?: number;
  reminderAtUtcMs?: number;
  source: EntrySource;
  recurrence?: RecurrenceSpec;
}

export interface DetectionCandidate {
  detected: boolean;
  confidence: DetectionConfidence;
  kind: EntryKind | null;
  titleHint?: string;
  memoHint?: string;
  localDate?: string;
  localTime?: string;
  endTime?: string;
  allDay?: boolean;
  reasons: string[];
  requiresConfirmation: boolean;
}

export interface CreateEntryInput {
  ownerKey: string;
  kind: EntryKind;
  title: string;
  memo?: string;
  date: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  recurrence?: RecurrenceSpec;
  reminderAt?: string;
  reminderMinutesBefore?: number;
  source?: EntrySource;
}

export interface UpdateEntryInput {
  ownerKey: string;
  entryId: string;
  title?: string;
  memo?: string;
  date?: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  recurrence?: RecurrenceSpec | null;
  reminderAt?: string | null;
  reminderMinutesBefore?: number | null;
  clearReminder?: boolean;
  status?: EntryStatus;
}

export interface SearchEntriesInput {
  ownerKey: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}

