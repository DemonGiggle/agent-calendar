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

