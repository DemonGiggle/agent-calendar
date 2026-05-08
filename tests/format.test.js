import test from "node:test";
import assert from "node:assert/strict";

import { formatAgendaText, formatOccurrenceLine } from "../dist/core/format.js";

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

test("formatAgendaText returns an empty-state message", () => {
  const text = formatAgendaText({
    title: "Agenda for 2026-05-10",
    timeZone: "UTC",
    occurrences: [],
  });

  assert.equal(text, "Agenda for 2026-05-10\nNo events found.");
});

test("formatOccurrenceLine renders all-day entries without a time label", () => {
  const line = formatOccurrenceLine(
    {
      occurrenceId: "entry-2:2026-05-10",
      entryId: "entry-2",
      kind: "event",
      title: "Company retreat",
      localDate: "2026-05-10",
      allDay: true,
      source: "manual",
    },
    "UTC",
  );

  assert.match(line, /^• .* — Company retreat$/);
  assert.doesNotMatch(line, /·/);
});
