import test from "node:test";
import assert from "node:assert/strict";

import { formatAgendaText } from "../dist/core/format.js";

test("formatAgendaText produces compact mobile-friendly output", () => {
  const text = formatAgendaText({
    title: "Upcoming (1)",
    timeZone: "UTC",
    occurrences: [
      {
        occurrenceId: "entry-1:2026-05-10",
        entryId: "entry-1",
        kind: "event",
        title: "Project sync",
        memo: "Bring updated timeline",
        localDate: "2026-05-10",
        allDay: false,
        startUtcMs: Date.parse("2026-05-10T09:00:00Z"),
        endUtcMs: Date.parse("2026-05-10T10:00:00Z"),
        source: "manual",
      },
    ],
  });

  assert.match(text, /Upcoming \(1\)/);
  assert.match(text, /Project sync/);
  assert.match(text, /note: Bring updated timeline/);
});

