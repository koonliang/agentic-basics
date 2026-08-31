import type { CanUseTool, HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";

const readableTools = ["Read", "Glob", "Grep"];

export function createAgentOptions(
  cwd: string,
  model: string,
  canUseTool: CanUseTool,
  writeGuard: HookCallback,
  postToolAudit: HookCallback,
): Options {
  return {
    cwd,
    model,
    maxTurns: 8,
    tools: [...readableTools, "Write"],
    allowedTools: [...readableTools],
    permissionMode: "default",
    settingSources: [],
    canUseTool,
    hooks: {
      PreToolUse: [{ matcher: "Write", hooks: [writeGuard] }],
      PostToolUse: [{ hooks: [postToolAudit] }],
    },
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [
        "You are a customer support agent.",
        "Verify the case, order, and policy before drafting a reply.",
        "Save support replies only as Markdown under drafts/ and never modify source records.",
        "A human must approve every Write request.",
      ].join(" "),
    },
  };
}

export type AgentEvent =
  | { type: "init"; tools: string[] }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; isError: boolean }
  | { type: "done"; success: boolean; result: string };

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
