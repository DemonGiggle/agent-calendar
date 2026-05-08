import {
  addDays,
  isValidDateKey,
  normalizeRelativeDateToken,
  utcMsToDateKey,
} from "./date-time.js";
import type { DetectionCandidate, EntryKind } from "./types.js";

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function normalizeTimeMatch(match: RegExpExecArray): string {
  const hourRaw = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  let hour = hourRaw;

  if (meridiem) {
    if (hour === 12) {
      hour = meridiem === "am" ? 0 : 12;
    } else if (meridiem === "pm") {
      hour += 12;
    }
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDateFromText(text: string, referenceDateKey: string): string | undefined {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch && isValidDateKey(isoMatch[1])) {
    return isoMatch[1];
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const referenceYear = Number(referenceDateKey.slice(0, 4));
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = slashMatch[3]
      ? Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
      : referenceYear;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;
  }

  const monthNameMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i,
  );
  if (monthNameMatch) {
    const referenceYear = Number(referenceDateKey.slice(0, 4));
    const month = MONTH_LOOKUP[monthNameMatch[1].toLowerCase()];
    const day = Number(monthNameMatch[2]);
    const year = monthNameMatch[3] ? Number(monthNameMatch[3]) : referenceYear;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;
  }

  const relative = normalizeRelativeDateToken(text, referenceDateKey);
  if (relative) {
    return relative;
  }

  if (/\bnext week\b/i.test(text)) {
    return addDays(referenceDateKey, 7);
  }

  return undefined;
}

function parseTimeFromText(text: string): string | undefined {
  const meridiemMatch = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (meridiemMatch) {
    return normalizeTimeMatch(meridiemMatch);
  }

  const twentyFourHourMatch = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1]}:${twentyFourHourMatch[2]}`;
  }

  return undefined;
}

function inferKind(text: string, hasTime: boolean): EntryKind {
  if (hasTime) {
    return "event";
  }
  if (/\b(note|memo|remember|track|write down)\b/i.test(text)) {
    return "memo";
  }
  return "event";
}

function extractTitleHint(text: string): string | undefined {
  const cleaned = text
    .replace(/\b(on|at|for|next week|today|tomorrow|day after tomorrow)\b/gi, " ")
    .replace(/\b(20\d{2}-\d{2}-\d{2})\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
      " ",
    )
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ")
    .replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, " ")
    .replace(/\b(add|create|schedule|put|save|remember|remind me|note)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

export function detectCandidateFromText(params: {
  text: string;
  nowMs?: number;
  timeZone: string;
  confirmFirst: boolean;
}): DetectionCandidate {
  const text = params.text.trim();
  const referenceDateKey = utcMsToDateKey(params.nowMs ?? Date.now(), params.timeZone);
  const localDate = parseDateFromText(text, referenceDateKey);
  const localTime = parseTimeFromText(text);
  const reasons: string[] = [];

  if (localDate) {
    reasons.push("Detected a concrete or relative date.");
  }
  if (localTime) {
    reasons.push("Detected a concrete time.");
  }
  if (/\b(meeting|call|appointment|schedule|event|demo|deadline|remind|remember|memo|note)\b/i.test(text)) {
    reasons.push("Detected calendar-related intent words.");
  }

  const detected = reasons.length > 0;
  const confidence =
    localDate && localTime
      ? "high"
      : localDate
        ? "medium"
        : reasons.length > 0
          ? "low"
          : "none";
  const kind = detected ? inferKind(text, Boolean(localTime)) : null;

  return {
    detected,
    confidence,
    kind,
    titleHint: detected ? extractTitleHint(text) : undefined,
    memoHint: kind === "memo" ? text : undefined,
    localDate,
    localTime,
    allDay: localDate ? !localTime : undefined,
    reasons,
    requiresConfirmation: params.confirmFirst || confidence !== "high",
  };
}

