import test from "node:test";
import assert from "node:assert/strict";

import { buildToolFailurePayload, describeToolError } from "../dist/openclaw/tool-errors.js";

test("describeToolError prefers Error messages", () => {
  assert.equal(describeToolError(new Error("boom")), "boom");
});

test("buildToolFailurePayload includes tool, step, and summary", () => {
  const payload = buildToolFailurePayload({
    tool: "cal_entry_create",
    step: "schedule-reminder",
    error: new Error("permission denied"),
  });

  assert.equal(payload.status, "failed");
  assert.equal(payload.tool, "cal_entry_create");
  assert.equal(payload.step, "schedule-reminder");
  assert.match(payload.summary, /permission denied/);
});
