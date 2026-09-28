import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@librechat/agents/langchain/messages";
import { inspectToolReplay, projectPortableToolReplay } from "./replay";

function toolCallMessage(id: string, content = ""): AIMessage {
  return new AIMessage({
    content,
    tool_calls: [
      { id, name: "web_search", args: { query: "test" }, type: "tool_call" },
    ],
  });
}

describe("portable historical tool replay", () => {
  it("leaves provider-native completed pairs unchanged", () => {
    const messages = [
      new HumanMessage("question"),
      toolCallMessage("call_native"),
      new ToolMessage({ content: "evidence", tool_call_id: "call_native" }),
      new AIMessage("answer"),
      new HumanMessage("follow-up"),
    ];

    const projection = projectPortableToolReplay(messages);

    expect(projection.projected).toBe(false);
    expect(projection.messages).toBe(messages);
    expect(projection.audit).toMatchObject({
      callCount: 1,
      resultCount: 1,
      fallbackIdCount: 0,
      requiresProjection: false,
    });
  });

  it("omits fallback-style tool protocol while retaining completed answers", () => {
    const fallbackCall = toolCallMessage("web_search_4");
    const messages = [
      new HumanMessage("first question"),
      toolCallMessage("call_native"),
      new ToolMessage({
        content: "first evidence",
        tool_call_id: "call_native",
      }),
      new AIMessage("first answer"),
      new HumanMessage("second question"),
      fallbackCall,
      new ToolMessage({
        content: "second evidence",
        tool_call_id: "web_search_4",
      }),
      new AIMessage("second answer"),
      new HumanMessage("current question"),
    ];

    const projection = projectPortableToolReplay(messages);

    expect(projection.projected).toBe(true);
    expect(projection.audit.fallbackIdCount).toBe(1);
    expect(projection.messages.map((message) => message._getType())).toEqual([
      "human",
      "ai",
      "human",
      "ai",
      "human",
    ]);
    expect(projection.messages.map((message) => message.content)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
      "current question",
    ]);
    expect(
      projection.messages.some((message) => message instanceof ToolMessage),
    ).toBe(false);
    expect(fallbackCall.tool_calls).toHaveLength(1);
  });

  it("projects orphaned and incomplete tool exchanges", () => {
    const messages = [
      new HumanMessage("question"),
      toolCallMessage("call_missing", "I will check."),
      new ToolMessage({
        content: "orphaned evidence",
        tool_call_id: "call_orphan",
      }),
      new HumanMessage("follow-up"),
    ];

    const audit = inspectToolReplay(messages);
    const projection = projectPortableToolReplay(messages);

    expect(audit).toMatchObject({
      orphanResultCount: 1,
      missingResultCount: 1,
      requiresProjection: true,
    });
    expect(projection.messages.map((message) => message.content)).toEqual([
      "question",
      "follow-up",
    ]);
  });

  it("projects the mixed four-call then two-call failure topology", () => {
    const messages = [
      new HumanMessage("first question"),
      new AIMessage({
        content: "",
        tool_calls: [1, 2, 3, 4].map((number) => ({
          id: `call_${number}`,
          name: "web_search",
          args: { query: `query ${number}` },
          type: "tool_call" as const,
        })),
      }),
      ...[1, 2, 3, 4].map(
        (number) =>
          new ToolMessage({
            content: `evidence ${number}`,
            tool_call_id: `call_${number}`,
          }),
      ),
      new AIMessage("first answer"),
      new HumanMessage("second question"),
      new AIMessage({
        content: "",
        tool_calls: [4, 5].map((number) => ({
          id: `web_search_${number}`,
          name: "web_search",
          args: { query: `query ${number}` },
          type: "tool_call" as const,
        })),
      }),
      ...[4, 5].map(
        (number) =>
          new ToolMessage({
            content: `later evidence ${number}`,
            tool_call_id: `web_search_${number}`,
          }),
      ),
      new AIMessage("second answer"),
      new HumanMessage("current question"),
    ];

    const projection = projectPortableToolReplay(messages);

    expect(projection.audit).toMatchObject({
      callCount: 6,
      resultCount: 6,
      fallbackIdCount: 2,
      requiresProjection: true,
    });
    expect(projection.omittedMessages).toBe(8);
    expect(projection.messages.map((message) => message.content)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
      "current question",
    ]);
  });

  it("flags duplicate and empty call identifiers and duplicate results", () => {
    const messages = [
      toolCallMessage("call_duplicate"),
      toolCallMessage("call_duplicate"),
      toolCallMessage(""),
      new ToolMessage({ content: "result", tool_call_id: "call_duplicate" }),
      new ToolMessage({
        content: "duplicate result",
        tool_call_id: "call_duplicate",
      }),
    ];

    expect(inspectToolReplay(messages)).toMatchObject({
      duplicateCallIdCount: 1,
      duplicateResultIdCount: 1,
      emptyIdCount: 1,
      requiresProjection: true,
    });
  });
});
