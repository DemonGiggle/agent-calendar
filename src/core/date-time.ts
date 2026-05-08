const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify([locale, timeZone, options]);
  const existing = dateFormatterCache.get(key);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat(locale, { timeZone, ...options });
  dateFormatterCache.set(key, formatter);
  return formatter;
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  return parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

export function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTimeKey(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function utcMsToDateKey(utcMs: number, timeZone: string): string {
  const formatter = getFormatter("en-CA", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(utcMs));
}

export function utcMsToTimeKey(utcMs: number, timeZone: string): string {
  const formatter = getFormatter("en-GB", timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date(utcMs));
}

export function formatDateLabel(dateKey: string, timeZone: string): string {
  const [year, month, day] = parseDateKey(dateKey);
  return getFormatter("en-US", timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export function formatTimeLabel(utcMs: number, timeZone: string): string {
  return getFormatter("en-US", timeZone, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(utcMs));
}

export function formatDateTimeLabel(utcMs: number, timeZone: string): string {
  return `${formatDateLabel(utcMsToDateKey(utcMs, timeZone), timeZone)} · ${formatTimeLabel(
    utcMs,
    timeZone,
  )}`;
}

export function parseDateKey(value: string): [number, number, number] {
  if (!isValidDateKey(value)) {
    throw new Error(`Invalid date. Expected YYYY-MM-DD, got: ${value}`);
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  return [year, month, day];
}

export function parseTimeKey(value: string): [number, number] {
  if (!isValidTimeKey(value)) {
    throw new Error(`Invalid time. Expected HH:MM, got: ${value}`);
  }

  const [hour, minute] = value.split(":").map((part) => Number(part));
  return [hour, minute];
}

function resolveTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const formatter = getFormatter("en-US", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = partsToRecord(formatter.formatToParts(new Date(utcMs)));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMs;
}

export function zonedDateTimeToUtcMs(
  dateKey: string,
  timeKey: string,
  timeZone: string,
): number {
  const [year, month, day] = parseDateKey(dateKey);
  const [hour, minute] = parseTimeKey(timeKey);
  const baseUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = baseUtc - resolveTimeZoneOffsetMs(baseUtc, timeZone);
  const correctedOffset = resolveTimeZoneOffsetMs(result, timeZone);
  result = baseUtc - correctedOffset;
  return result;
}

export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

export function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1 + months, day, 12, 0, 0));
  if (next.getUTCDate() !== day) {
    return "";
  }
  return next.toISOString().slice(0, 10);
}

export function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function normalizeRelativeDateToken(text: string, referenceDateKey: string): string | undefined {
  const lowered = text.toLowerCase();
  if (/\bday after tomorrow\b/.test(lowered)) {
    return addDays(referenceDateKey, 2);
  }
  if (/\btomorrow\b/.test(lowered)) {
    return addDays(referenceDateKey, 1);
  }
  if (/\btoday\b/.test(lowered)) {
    return referenceDateKey;
  }
  return undefined;
}

