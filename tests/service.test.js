import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { SQLiteCalendarRepository } from "../dist/core/repository.js";
import { CalendarService } from "../dist/core/service.js";

test("CalendarService creates and lists upcoming events", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-calendar-"));
  const repository = new SQLiteCalendarRepository(path.join(tempDir, "calendar.sqlite"));
  const service = new CalendarService(repository, "UTC", 5);

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

