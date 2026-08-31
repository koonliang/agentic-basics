import type { Options } from "@anthropic-ai/claude-agent-sdk";

const readOnlyTools = ["Read", "Glob", "Grep"];

export type AgentEvent =
  | { type: "init"; tools: string[] }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; isError: boolean }
  | { type: "done"; success: boolean; result: string };

export function createAgentOptions(cwd: string, model: string): Options {
  return {
    cwd,
    model,
    maxTurns: 8,
    tools: [...readOnlyTools],
    allowedTools: [...readOnlyTools],
    permissionMode: "dontAsk",
    settingSources: [],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [
        "You are a read-only customer support investigator.",
        "Cases are under cases/, order records are in orders.json, and policies are under policies/.",
        "After reading the requested case, use direct reads or targeted searches to verify its order and relevant policy.",
        "Avoid broad file searches when the location is already known, and answer as soon as the evidence is complete.",
        "Cite the relative file paths that support your answer and do not guess missing facts.",
      ].join(" "),
    },
  };
}

export function eventsFromMessage(message: unknown): AgentEvent[] {
  if (!isRecord(message) || typeof message.type !== "string") return [];

  if (message.type === "system" && message.subtype === "init") {
    const tools = Array.isArray(message.tools)
      ? message.tools.filter((tool): tool is string => typeof tool === "string")
      : [];
    return [{ type: "init", tools }];
  }

  if (message.type === "assistant" && isRecord(message.message)) {
    return contentBlocks(message.message.content).flatMap((block): AgentEvent[] => {
      if (block.type === "text" && typeof block.text === "string") {
        return [{ type: "text", text: block.text }];
      }
      if (block.type === "tool_use" && typeof block.name === "string") {
        return [{ type: "tool_use", name: block.name, input: block.input }];
      }
      return [];
    });
  }

  if (message.type === "user" && isRecord(message.message)) {
    return contentBlocks(message.message.content).flatMap((block): AgentEvent[] => {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") return [];
      return [{
        type: "tool_result",
        toolUseId: block.tool_use_id,
        isError: block.is_error === true,
      }];
    });
  }

  if (message.type === "result") {
    if (message.subtype === "success" && typeof message.result === "string") {
      return [{ type: "done", success: !message.is_error, result: message.result }];
    }
    const errors = Array.isArray(message.errors)
      ? message.errors.filter((error): error is string => typeof error === "string")
      : [];
    return [{
      type: "done",
      success: false,
      result: errors.join("\n") || `Agent stopped with ${String(message.subtype)}.`,
    }];
  }

  return [];
}

function contentBlocks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
