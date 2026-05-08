import { stripTargetKindPrefix } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

export interface OwnerScope {
  ownerKey: string;
  deliveryTarget?: {
    channel: string;
    to: string;
    accountId?: string;
    threadId?: string | number;
  };
}

export interface InboundOwnerContext {
  conversationId?: string;
  senderId?: string;
}

function readNonBlankString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeOwnerIdentifier(value: string | undefined): string | undefined {
  const normalized = readNonBlankString(value);
  return normalized ? stripTargetKindPrefix(normalized) : undefined;
}

function preferGroupOwnerKey(params: {
  channel: string;
  accountId?: string;
  senderId?: string;
  conversationId?: string;
  target?: string;
}): string | undefined {
  const accountKey = params.accountId ?? "default";
  const senderId = normalizeOwnerIdentifier(params.senderId);
  const conversationId = normalizeOwnerIdentifier(params.conversationId);
  const fallbackTarget = normalizeOwnerIdentifier(params.target);

  if (conversationId && senderId && conversationId !== senderId) {
    return `target:${params.channel}:${accountKey}:${conversationId}`;
  }

  if (senderId) {
    return `sender:${params.channel}:${accountKey}:${senderId}`;
  }

  if (conversationId) {
    return `target:${params.channel}:${accountKey}:${conversationId}`;
  }

  if (fallbackTarget) {
    return `target:${params.channel}:${accountKey}:${fallbackTarget}`;
  }

  return undefined;
}

export function resolveOwnerScope(
  ctx: OpenClawPluginToolContext,
  inboundContext?: InboundOwnerContext,
): OwnerScope {
  const channel = ctx.deliveryContext?.channel ?? ctx.messageChannel ?? "unknown";
  const accountId = ctx.deliveryContext?.accountId;
  const senderId = ctx.requesterSenderId ?? inboundContext?.senderId;
  const target = ctx.deliveryContext?.to;

  const ownerKey =
    preferGroupOwnerKey({
      channel,
      accountId,
      senderId,
      conversationId: inboundContext?.conversationId,
      target,
    }) ??
    (ctx.sessionKey
      ? `session:${ctx.sessionKey}`
      : `agent:${ctx.agentId ?? "default"}`);

  return {
    ownerKey,
    deliveryTarget:
      channel && target
        ? {
            channel,
            to: target,
            accountId,
            threadId: ctx.deliveryContext?.threadId,
          }
        : undefined,
  };
}

export function buildCalendarPromptGuidance(params: {
  detectionMode: "confirm_first" | "auto_save_high_confidence";
}): string {
  return [
    "Calendar plugin guidance:",
    "- When the user mentions a concrete date, time, appointment, reminder, or memo-worthy event, consider the calendar tools.",
    "- Use cal_candidate_detect first when the wording is ambiguous or you need a structured guess from raw text.",
    `- Default behavior is ${params.detectionMode === "auto_save_high_confidence" ? "confirm before saving unless the user clearly asked to save and the extracted event is high-confidence" : "confirm before creating, updating, or deleting entries"}.`,
    "- Use cal_agenda_upcoming for short mobile-friendly upcoming views and cal_agenda_day for a specific date.",
    "- Keep replies compact for chat clients; do not render calendar tables.",
  ].join("\n");
}

export function looksCalendarRelevant(prompt: string): boolean {
  return /\b(calendar|agenda|schedule|event|memo|note|meeting|appointment|deadline|remember|remind|today|tomorrow|next week|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
    prompt,
  );
}
