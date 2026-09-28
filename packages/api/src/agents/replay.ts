import { AIMessage, ToolMessage } from "@librechat/agents/langchain/messages";
import type { BaseMessage } from "@librechat/agents/langchain/messages";

export interface ToolReplayAudit {
  readonly callCount: number;
  readonly resultCount: number;
  readonly fallbackIdCount: number;
  readonly emptyIdCount: number;
  readonly duplicateCallIdCount: number;
  readonly duplicateResultIdCount: number;
  readonly orphanResultCount: number;
  readonly missingResultCount: number;
  readonly requiresProjection: boolean;
}

export interface PortableToolReplayProjection {
  readonly messages: BaseMessage[];
  readonly audit: ToolReplayAudit;
  readonly projected: boolean;
  readonly omittedMessages: number;
}

function isFallbackToolCallId(id: string, name: string): boolean {
  const prefix = `${name}_`;
  return id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length));
}

/** Audits completed historical client-tool exchanges before provider replay. */
export function inspectToolReplay(
  messages: readonly BaseMessage[],
): ToolReplayAudit {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  let callCount = 0;
  let resultCount = 0;
  let fallbackIdCount = 0;
  let emptyIdCount = 0;
  let duplicateCallIdCount = 0;
  let duplicateResultIdCount = 0;

  for (const message of messages) {
    if (message instanceof AIMessage) {
      for (const call of message.tool_calls ?? []) {
        callCount += 1;
        const id = typeof call.id === "string" ? call.id.trim() : "";
        const name = typeof call.name === "string" ? call.name : "";
        if (!id) {
          emptyIdCount += 1;
          continue;
        }
        if (callIds.has(id)) {
          duplicateCallIdCount += 1;
        }
        callIds.add(id);
        if (name && isFallbackToolCallId(id, name)) {
          fallbackIdCount += 1;
        }
      }
      continue;
    }

    if (!(message instanceof ToolMessage)) {
      continue;
    }
    resultCount += 1;
    const id =
      typeof message.tool_call_id === "string"
        ? message.tool_call_id.trim()
        : "";
    if (!id) {
      emptyIdCount += 1;
      continue;
    }
    if (resultIds.has(id)) {
      duplicateResultIdCount += 1;
    }
    resultIds.add(id);
  }

  let orphanResultCount = 0;
  for (const id of resultIds) {
    if (!callIds.has(id)) {
      orphanResultCount += 1;
    }
  }
  let missingResultCount = 0;
  for (const id of callIds) {
    if (!resultIds.has(id)) {
      missingResultCount += 1;
    }
  }

  const requiresProjection =
    fallbackIdCount > 0 ||
    emptyIdCount > 0 ||
    duplicateCallIdCount > 0 ||
    duplicateResultIdCount > 0 ||
    orphanResultCount > 0 ||
    missingResultCount > 0;

  return Object.freeze({
    callCount,
    resultCount,
    fallbackIdCount,
    emptyIdCount,
    duplicateCallIdCount,
    duplicateResultIdCount,
    orphanResultCount,
    missingResultCount,
    requiresProjection,
  });
}

/**
 * Keeps completed answers but omits non-portable historical call/result protocol
 * records from the provider-bound transcript. Stored messages and UI artifacts are
 * untouched; the current turn can invoke the same tools again when evidence is needed.
 */
export function projectPortableToolReplay(
  messages: BaseMessage[],
): PortableToolReplayProjection {
  const audit = inspectToolReplay(messages);
  if (!audit.requiresProjection) {
    return Object.freeze({
      messages,
      audit,
      projected: false,
      omittedMessages: 0,
    });
  }

  const projected: BaseMessage[] = [];
  let omittedMessages = 0;
  for (const message of messages) {
    if (
      message instanceof ToolMessage ||
      (message instanceof AIMessage && (message.tool_calls?.length ?? 0) > 0)
    ) {
      omittedMessages += 1;
      continue;
    }
    projected.push(message);
  }

  return Object.freeze({
    messages: projected,
    audit,
    projected: true,
    omittedMessages,
  });
}
