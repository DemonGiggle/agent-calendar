import test from "node:test";
import assert from "node:assert/strict";

import { resolveOwnerScope } from "../dist/openclaw/context.js";

test("resolveOwnerScope prefers group target ids when present", () => {
  const result = resolveOwnerScope({
    messageChannel: "telegram",
    requesterSenderId: "alice",
    deliveryContext: {
      channel: "telegram",
      to: "-100123456",
    },
  }, {
    conversationId: "-100123456",
    senderId: "alice",
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
    conversationId: "alice",
    senderId: "alice",
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
