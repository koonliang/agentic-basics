import type { AgentDefinition, Options } from "@anthropic-ai/claude-agent-sdk";

const readOnlyTools = ["Read", "Glob", "Grep"];

export const specialistNames = ["order-investigator", "policy-specialist"] as const;

export type AgentEvent =
  | { type: "init"; tools: string[] }
  | { type: "text"; source: string; text: string }
  | { type: "tool_use"; source: string; name: string; input: unknown }
  | { type: "tool_result"; source: string; toolUseId: string; isError: boolean }
  | { type: "done"; success: boolean; result: string };

export function createCoordinatorOptions(cwd: string, model: string): Options {
  return {
    cwd,
    model,
    maxTurns: 8,
    tools: ["Agent", ...readOnlyTools],
    allowedTools: ["Agent", ...readOnlyTools],
    permissionMode: "dontAsk",
    settingSources: [],
    agents: createSpecialists(),
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: [
        "You coordinate customer support investigations.",
        "For every case, delegate order and case verification to order-investigator and policy interpretation to policy-specialist.",
        "Launch both specialists together when their work is independent.",
        "Give each specialist the case path and exact evidence it must return because subagents do not receive your conversation history.",
        "Do not investigate the files yourself; use the specialists' reports.",
        "Synthesize one answer with separate Verified facts, Applicable policy, and Recommendation sections.",
        "Cite the relative paths reported by the specialists and do not invent missing evidence.",
      ].join(" "),
    },
  };
}

function createSpecialists(): Record<string, AgentDefinition> {
  return {
    "order-investigator": {
      description: "Verifies support case details and matching order records from local files.",
      prompt: [
        "You are an order evidence specialist.",
        "Read the requested case and find its matching record in orders.json.",
        "Report only verified customer, order, timing, status, and issue facts.",
        "Cite every relative file path used and explicitly identify missing or conflicting evidence.",
        "Do not interpret refund policy.",
      ].join(" "),
      tools: [...readOnlyTools],
      model: "inherit",
      maxTurns: 5,
    },
    "policy-specialist": {
      description: "Finds and interprets the refund policy relevant to verified support-case facts.",
      prompt: [
        "You are a support policy specialist.",
        "Read the relevant policy files and apply their stated rules to the facts supplied in your task.",
        "Quote no long passages; summarize the applicable rule and cite every relative file path used.",
        "State what additional facts are required when the supplied evidence is incomplete.",
        "Do not inspect or change order records.",
      ].join(" "),
      tools: [...readOnlyTools],
      model: "inherit",
      maxTurns: 5,
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
    const source = messageSource(message);
    return contentBlocks(message.message.content).flatMap((block): AgentEvent[] => {
      if (block.type === "text" && typeof block.text === "string") {
        return [{ type: "text", source, text: block.text }];
      }
      if (block.type === "tool_use" && typeof block.name === "string") {
        return [{ type: "tool_use", source, name: block.name, input: block.input }];
      }
      return [];
    });
  }

  if (message.type === "user" && isRecord(message.message)) {
    const source = typeof message.parent_tool_use_id === "string" ? "subagent" : "coordinator";
    return contentBlocks(message.message.content).flatMap((block): AgentEvent[] => {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") return [];
      return [{
        type: "tool_result",
        source,
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
      result: errors.join("\n") || `Coordinator stopped with ${String(message.subtype)}.`,
    }];
  }

  return [];
}

function messageSource(message: Record<string, unknown>): string {
  if (typeof message.subagent_type === "string") return message.subagent_type;
  if (typeof message.parent_tool_use_id === "string") return "subagent";
  return "coordinator";
}

function contentBlocks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
