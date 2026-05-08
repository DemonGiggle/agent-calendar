import test from "node:test";
import assert from "node:assert/strict";

import { parsePluginConfig, resolveSystemTimezone } from "../dist/core/config.js";

test("parsePluginConfig defaults timezone to the current system timezone", () => {
  const result = parsePluginConfig({});

  assert.equal(result.defaultTimezone, resolveSystemTimezone());
});
