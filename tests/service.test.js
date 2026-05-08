import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { SQLiteCalendarRepository } from "../dist/core/repository.js";
import { CalendarService } from "../dist/core/service.js";

function createTestService(defaultAgendaLimit = 5, timeZone = "UTC") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-calendar-"));
  const repository = new SQLiteCalendarRepository(path.join(tempDir, "calendar.sqlite"));
  return new CalendarService(repository, timeZone, defaultAgendaLimit);
}

test("CalendarService creates and lists upcoming events", () => {
  const service = createTestService();

  service.createEntry({
    ownerKey: "sender:test:default:alice",
    kind: "event",
    title: "Team sync",
    date: "2026-05-10",
    time: "09:00",
    endTime: "10:00",
  });

  const upcoming = service.listUpcoming(
    "sender:test:default:alice",
    5,
    Date.parse("2026-05-08T00:00:00Z"),
  );

  assert.equal(upcoming.occurrences.length, 1);
  assert.match(upcoming.text, /Team sync/);
});

test("CalendarService returns timed and all-day events from the same day", () => {
  const service = createTestService(10);

  service.createEntry({
    ownerKey: "target:test:default:group-1",
    kind: "event",
    title: "Design review",
    date: "2026-05-10",
    time: "09:00",
    endTime: "10:00",
  });

  service.createEntry({
    ownerKey: "target:test:default:group-1",
    kind: "event",
    title: "Company retreat",
    date: "2026-05-10",
    allDay: true,
  });

  const agenda = service.listAgendaForDate("target:test:default:group-1", "2026-05-10");

  assert.equal(agenda.occurrences.length, 2);
  assert.equal(
    agenda.occurrences.filter((occurrence) => occurrence.allDay).length,
    1,
  );
  assert.equal(
    agenda.occurrences.filter((occurrence) => !occurrence.allDay).length,
    1,
  );
  assert.match(agenda.text, /Design review/);
  assert.match(agenda.text, /Company retreat/);
});

test("CalendarService skips past timed events before applying the upcoming limit", () => {
  const service = createTestService(1);

  service.createEntry({
    ownerKey: "sender:test:default:alice",
    kind: "event",
    title: "Past standup",
    date: "2026-05-10",
    time: "08:00",
    endTime: "08:30",
  });
  service.createEntry({
    ownerKey: "sender:test:default:alice",
    kind: "event",
    title: "Future standup",
    date: "2026-05-10",
    time: "10:00",
    endTime: "10:30",
  });

  const upcoming = service.listUpcoming(
    "sender:test:default:alice",
    undefined,
    Date.parse("2026-05-10T09:30:00Z"),
  );

  assert.equal(upcoming.occurrences.length, 1);
  assert.equal(upcoming.occurrences[0]?.title, "Future standup");
  assert.match(upcoming.text, /Upcoming \(1\)/);
  assert.doesNotMatch(upcoming.text, /Past standup/);
});

test("CalendarService fast-forwards long-running recurring events into the upcoming window", () => {
  const service = createTestService(10);

  service.createEntry({
    ownerKey: "sender:test:default:alice",
    kind: "event",
    title: "Daily standup",
    date: "2024-11-29",
    allDay: true,
    recurrence: {
      frequency: "daily",
      interval: 1,
      untilDate: "2026-05-10",
    },
  });

  const upcoming = service.listUpcoming(
    "sender:test:default:alice",
    10,
    Date.parse("2026-05-08T00:00:00Z"),
  );

  assert.deepEqual(
    upcoming.occurrences.map((occurrence) => occurrence.localDate),
    ["2026-05-08", "2026-05-09", "2026-05-10"],
  );
  assert.deepEqual(
    upcoming.occurrences.map((occurrence) => occurrence.title),
    ["Daily standup", "Daily standup", "Daily standup"],
  );
});

test("CalendarService updates, searches, and cancels entries", () => {
  const service = createTestService(10);
  const created = service.createEntry({
    ownerKey: "sender:test:default:alice",
    kind: "memo",
    title: "Draft roadmap",
    memo: "Initial note",
    date: "2026-05-12",
    source: "detected",
  });

  const updated = service.updateEntry({
    ownerKey: "sender:test:default:alice",
    entryId: created.id,
    title: "Project kickoff",
    memo: "Bring the latest roadmap",
    date: "2026-05-13",
    time: "13:00",
    endTime: "14:00",
    allDay: false,
    reminderMinutesBefore: 30,
  });

  assert.equal(updated.title, "Project kickoff");
  assert.equal(updated.memo, "Bring the latest roadmap");
  assert.equal(updated.allDay, false);
  assert.equal(updated.startUtcMs, Date.parse("2026-05-13T13:00:00Z"));
  assert.equal(updated.endUtcMs, Date.parse("2026-05-13T14:00:00Z"));
  assert.equal(updated.reminderAtUtcMs, Date.parse("2026-05-13T12:30:00.000Z"));

  const search = service.searchEntries({
    ownerKey: "sender:test:default:alice",
    query: "kickoff",
    dateFrom: "2026-05-13",
    dateTo: "2026-05-13",
    limit: 5,
  });
  assert.equal(search.entries.length, 1);
  assert.equal(search.entries[0]?.id, created.id);
  assert.match(search.text, /Project kickoff/);

  const deleted = service.deleteEntry("sender:test:default:alice", created.id);
  assert.equal(deleted.status, "cancelled");
  assert.equal(
    service.listUpcoming(
      "sender:test:default:alice",
      5,
      Date.parse("2026-05-13T00:00:00Z"),
    ).occurrences.length,
    0,
  );
  assert.equal(service.listAgendaForDate("sender:test:default:alice", "2026-05-13").occurrences.length, 0);
});

test("CalendarService rejects invalid dates and end times", () => {
  const service = createTestService();

  assert.throws(
    () =>
      service.createEntry({
        ownerKey: "sender:test:default:alice",
        kind: "event",
        title: "Bad date",
        date: "2026-5-10",
      }),
    /Invalid date/,
  );

  assert.throws(
    () =>
      service.createEntry({
        ownerKey: "sender:test:default:alice",
        kind: "event",
        title: "Impossible meeting",
        date: "2026-05-10",
        time: "10:00",
        endTime: "09:00",
      }),
    /endTime must be after time/,
  );
});
