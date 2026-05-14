import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOwnerResolutionDebug,
  resolveOwnerScope,
  shouldInjectCalendarPromptGuidance,
} from "../dist/openclaw/context.js";

test("resolveOwnerScope prefers group target ids when present", () => {
  const result = resolveOwnerScope({
    messageChannel: "telegram",
    requesterSenderId: "alice",
    deliveryContext: {
      channel: "telegram",
      to: "-100123456",
    },
  }, {
    conversationId: "telegram:-100123456",
    senderId: "alice",
    originatingTarget: "telegram:-100123456",
  });

  assert.equal(result.ownerKey, "target:telegram:default:-100123456");
});

test("resolveOwnerScope falls back to sender id when conversation id matches sender", () => {
  const result = resolveOwnerScope({
    messageChannel: "telegram",
    requesterSenderId: "alice",
    deliveryContext: {
      channel: "telegram",
      to: "alice",
    },
  }, {
    conversationId: "telegram:alice",
    senderId: "alice",
    originatingTarget: "telegram:alice",
  });

  assert.equal(result.ownerKey, "sender:telegram:default:alice");
});

test("resolveOwnerScope still uses sender id when user-prefixed targets normalize to the same sender", () => {
  const result = resolveOwnerScope({
    messageChannel: "telegram",
    requesterSenderId: "alice",
    deliveryContext: {
      channel: "telegram",
      to: "user:alice",
    },
  });

  assert.equal(result.ownerKey, "sender:telegram:default:alice");
});

test("buildOwnerResolutionDebug includes the normalized decision inputs", () => {
  const debug = buildOwnerResolutionDebug({
    ownerKey: "target:telegram:default:-100123456",
    toolContext: {
      messageChannel: "telegram",
      requesterSenderId: "alice",
      sessionKey: "session-1",
      deliveryContext: {
        channel: "telegram",
        to: "telegram:-100123456",
      },
    },
    inboundContext: {
      conversationId: "telegram:-100123456",
      senderId: "alice",
      originatingTarget: "telegram:-100123456",
    },
  });

  assert.match(debug, /ownerKey=target:telegram:default:-100123456/);
  assert.match(debug, /originatingTarget=telegram:-100123456/);
});

test("shouldInjectCalendarPromptGuidance matches calendar-like chat prompts", () => {
  assert.equal(
    shouldInjectCalendarPromptGuidance({
      prompt: "Schedule lunch with Sam tomorrow at 12:30",
    }),
    true,
  );
});

test("shouldInjectCalendarPromptGuidance ignores cron-launched prompts", () => {
  assert.equal(
    shouldInjectCalendarPromptGuidance({
      prompt: "Schedule lunch with Sam tomorrow at 12:30",
      jobId: "cron-job-123",
    }),
    false,
  );
});
