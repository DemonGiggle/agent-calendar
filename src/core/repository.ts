import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CalendarEntry, RecurrenceSpec } from "./types.js";

type EntryRow = {
  id: string;
  owner_key: string;
  kind: string;
  title: string;
  memo: string | null;
  local_date: string;
  all_day: number;
  start_utc_ms: number | null;
  end_utc_ms: number | null;
  recurrence_frequency: string | null;
  recurrence_interval: number | null;
  recurrence_until_date: string | null;
  reminder_at_utc_ms: number | null;
  reminder_job_id: string | null;
  source: string;
  status: string;
  created_at_ms: number;
  updated_at_ms: number;
};

function serializeRecurrence(recurrence?: RecurrenceSpec): {
  recurrence_frequency: string | null;
  recurrence_interval: number | null;
  recurrence_until_date: string | null;
} {
  return {
    recurrence_frequency: recurrence?.frequency ?? null,
    recurrence_interval: recurrence?.interval ?? null,
    recurrence_until_date: recurrence?.untilDate ?? null,
  };
}

function mapRowToEntry(row: EntryRow): CalendarEntry {
  return {
    id: row.id,
    ownerKey: row.owner_key,
    kind: row.kind as CalendarEntry["kind"],
    title: row.title,
    memo: row.memo ?? undefined,
    localDate: row.local_date,
    allDay: row.all_day === 1,
    startUtcMs: row.start_utc_ms ?? undefined,
    endUtcMs: row.end_utc_ms ?? undefined,
    recurrence:
      row.recurrence_frequency != null
        ? {
            frequency: row.recurrence_frequency as NonNullable<CalendarEntry["recurrence"]>["frequency"],
            interval: row.recurrence_interval ?? 1,
            untilDate: row.recurrence_until_date ?? undefined,
          }
        : undefined,
    reminderAtUtcMs: row.reminder_at_utc_ms ?? undefined,
    reminderJobId: row.reminder_job_id ?? undefined,
    source: row.source as CalendarEntry["source"],
    status: row.status as CalendarEntry["status"],
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export class SQLiteCalendarRepository {
  private readonly database: DatabaseSync;

  constructor(private readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.database = new DatabaseSync(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA foreign_keys = ON;");
    const versionRow = this.database.prepare("PRAGMA user_version;").get() as
      | { user_version?: number }
      | undefined;
    const version = Number(versionRow?.user_version ?? 0);
    if (version === 0) {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS calendar_entries (
          id TEXT PRIMARY KEY,
          owner_key TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('event', 'memo')),
          title TEXT NOT NULL,
          memo TEXT,
          local_date TEXT NOT NULL,
          all_day INTEGER NOT NULL DEFAULT 0,
          start_utc_ms INTEGER,
          end_utc_ms INTEGER,
          recurrence_frequency TEXT,
          recurrence_interval INTEGER,
          recurrence_until_date TEXT,
          reminder_at_utc_ms INTEGER,
          reminder_job_id TEXT,
          source TEXT NOT NULL CHECK (source IN ('manual', 'detected')),
          status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_entries_owner_date
          ON calendar_entries (owner_key, local_date, status);
      `);
      this.database.exec("PRAGMA user_version = 1;");
    }
  }

  createEntry(entry: CalendarEntry): CalendarEntry {
    const recurrence = serializeRecurrence(entry.recurrence);
    this.database
      .prepare(
        `
          INSERT INTO calendar_entries (
            id, owner_key, kind, title, memo, local_date, all_day, start_utc_ms, end_utc_ms,
            recurrence_frequency, recurrence_interval, recurrence_until_date,
            reminder_at_utc_ms, reminder_job_id, source, status, created_at_ms, updated_at_ms
          ) VALUES (
            @id, @owner_key, @kind, @title, @memo, @local_date, @all_day, @start_utc_ms, @end_utc_ms,
            @recurrence_frequency, @recurrence_interval, @recurrence_until_date,
            @reminder_at_utc_ms, @reminder_job_id, @source, @status, @created_at_ms, @updated_at_ms
          );
        `,
      )
      .run({
        id: entry.id,
        owner_key: entry.ownerKey,
        kind: entry.kind,
        title: entry.title,
        memo: entry.memo ?? null,
        local_date: entry.localDate,
        all_day: entry.allDay ? 1 : 0,
        start_utc_ms: entry.startUtcMs ?? null,
        end_utc_ms: entry.endUtcMs ?? null,
        recurrence_frequency: recurrence.recurrence_frequency,
        recurrence_interval: recurrence.recurrence_interval,
        recurrence_until_date: recurrence.recurrence_until_date,
        reminder_at_utc_ms: entry.reminderAtUtcMs ?? null,
        reminder_job_id: entry.reminderJobId ?? null,
        source: entry.source,
        status: entry.status,
        created_at_ms: entry.createdAtMs,
        updated_at_ms: entry.updatedAtMs,
      });
    return entry;
  }

  updateEntry(entry: CalendarEntry): CalendarEntry {
    const recurrence = serializeRecurrence(entry.recurrence);
    this.database
      .prepare(
        `
          UPDATE calendar_entries
          SET title = @title,
              memo = @memo,
              local_date = @local_date,
              all_day = @all_day,
              start_utc_ms = @start_utc_ms,
              end_utc_ms = @end_utc_ms,
              recurrence_frequency = @recurrence_frequency,
              recurrence_interval = @recurrence_interval,
              recurrence_until_date = @recurrence_until_date,
              reminder_at_utc_ms = @reminder_at_utc_ms,
              reminder_job_id = @reminder_job_id,
              source = @source,
              status = @status,
              updated_at_ms = @updated_at_ms
          WHERE id = @id AND owner_key = @owner_key;
        `,
      )
      .run({
        id: entry.id,
        owner_key: entry.ownerKey,
        title: entry.title,
        memo: entry.memo ?? null,
        local_date: entry.localDate,
        all_day: entry.allDay ? 1 : 0,
        start_utc_ms: entry.startUtcMs ?? null,
        end_utc_ms: entry.endUtcMs ?? null,
        recurrence_frequency: recurrence.recurrence_frequency,
        recurrence_interval: recurrence.recurrence_interval,
        recurrence_until_date: recurrence.recurrence_until_date,
        reminder_at_utc_ms: entry.reminderAtUtcMs ?? null,
        reminder_job_id: entry.reminderJobId ?? null,
        source: entry.source,
        status: entry.status,
        updated_at_ms: entry.updatedAtMs,
      });
    return entry;
  }

  getEntry(ownerKey: string, entryId: string): CalendarEntry | undefined {
    const row = this.database
      .prepare(
        `
          SELECT * FROM calendar_entries
          WHERE owner_key = ? AND id = ?
          LIMIT 1;
        `,
      )
      .get(ownerKey, entryId) as EntryRow | undefined;
    return row ? mapRowToEntry(row) : undefined;
  }

  listActiveEntries(ownerKey: string): CalendarEntry[] {
    const rows = this.database
      .prepare(
        `
          SELECT * FROM calendar_entries
          WHERE owner_key = ? AND status = 'active'
          ORDER BY local_date ASC, COALESCE(start_utc_ms, created_at_ms) ASC;
        `,
      )
      .all(ownerKey) as EntryRow[];
    return rows.map(mapRowToEntry);
  }

  searchEntries(params: {
    ownerKey: string;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
  }): CalendarEntry[] {
    const conditions = ["owner_key = @owner_key", "status = 'active'"];
    const values: Record<string, string | number> = {
      owner_key: params.ownerKey,
      limit: params.limit,
    };

    if (params.query) {
      conditions.push("(title LIKE @pattern OR COALESCE(memo, '') LIKE @pattern)");
      values.pattern = `%${params.query}%`;
    }
    if (params.dateFrom) {
      conditions.push("local_date >= @date_from");
      values.date_from = params.dateFrom;
    }
    if (params.dateTo) {
      conditions.push("local_date <= @date_to");
      values.date_to = params.dateTo;
    }

    const rows = this.database
      .prepare(
        `
          SELECT * FROM calendar_entries
          WHERE ${conditions.join(" AND ")}
          ORDER BY local_date ASC, COALESCE(start_utc_ms, created_at_ms) ASC
          LIMIT @limit;
        `,
      )
      .all(values) as EntryRow[];
    return rows.map(mapRowToEntry);
  }
}
