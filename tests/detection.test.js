import test from "node:test";
import assert from "node:assert/strict";

import { detectCandidateFromText } from "../dist/core/detection.js";

test("detectCandidateFromText extracts explicit dates and times", () => {
  const result = detectCandidateFromText({
    text: "Schedule project demo on 2026-05-10 at 3:30pm",
    nowMs: Date.parse("2026-05-08T00:00:00Z"),
    timeZone: "UTC",
    confirmFirst: true,
  });

  assert.equal(result.detected, true);
  assert.equal(result.localDate, "2026-05-10");
  assert.equal(result.localTime, "15:30");
  assert.equal(result.confidence, "high");
  assert.equal(result.requiresConfirmation, true);
});

test("detectCandidateFromText parses slash dates and 24-hour times", () => {
  const result = detectCandidateFromText({
    text: "Schedule launch review on 5/10 at 09:45",
    nowMs: Date.parse("2026-05-08T00:00:00Z"),
    timeZone: "UTC",
    confirmFirst: false,
  });

  assert.equal(result.detected, true);
  assert.equal(result.localDate, "2026-05-10");
  assert.equal(result.localTime, "09:45");
  assert.equal(result.requiresConfirmation, false);
});

test("detectCandidateFromText detects relative-date memos without a time", () => {
  const result = detectCandidateFromText({
    text: "Remember budget note next week",
    nowMs: Date.parse("2026-05-08T00:00:00Z"),
    timeZone: "UTC",
    confirmFirst: false,
  });

  assert.equal(result.detected, true);
  assert.equal(result.kind, "memo");
  assert.equal(result.localDate, "2026-05-15");
  assert.equal(result.allDay, true);
  assert.equal(result.memoHint, "Remember budget note next week");
  assert.equal(result.confidence, "medium");
  assert.equal(result.requiresConfirmation, true);
});
