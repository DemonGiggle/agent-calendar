import {
  formatDateLabel,
  formatDateTimeLabel,
  formatTimeLabel,
  utcMsToDateKey,
} from "./date-time.js";
import type { AgendaOccurrence, CalendarEntry } from "./types.js";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

export function formatOccurrenceLine(occurrence: AgendaOccurrence, timeZone: string): string {
  if (occurrence.allDay || occurrence.startUtcMs == null) {
    return `• ${formatDateLabel(occurrence.localDate, timeZone)} — ${truncate(occurrence.title, 54)}`;
  }

  const startDateKey = utcMsToDateKey(occurrence.startUtcMs, timeZone);
  const dateLabel = formatDateLabel(startDateKey, timeZone);
  const startLabel = formatTimeLabel(occurrence.startUtcMs, timeZone);
  const endLabel =
    occurrence.endUtcMs != null ? `–${formatTimeLabel(occurrence.endUtcMs, timeZone)}` : "";
  return `• ${dateLabel} · ${startLabel}${endLabel} — ${truncate(occurrence.title, 44)}`;
}

export function formatAgendaText(params: {
  title: string;
  occurrences: AgendaOccurrence[];
  timeZone: string;
}): string {
  if (params.occurrences.length === 0) {
    return `${params.title}\nNo events found.`;
  }

  const lines = [params.title];
  for (const occurrence of params.occurrences) {
    lines.push(formatOccurrenceLine(occurrence, params.timeZone));
    if (occurrence.memo) {
      lines.push(`  note: ${truncate(occurrence.memo, 72)}`);
    }
  }
  return lines.join("\n");
}

export function formatEntrySummary(entry: CalendarEntry, timeZone: string): string {
  const when = entry.allDay
    ? formatDateLabel(entry.localDate, timeZone)
    : entry.startUtcMs != null
      ? formatDateTimeLabel(entry.startUtcMs, timeZone)
      : formatDateLabel(entry.localDate, timeZone);
  return `${entry.title} (${when})`;
}

