import { query, type AgentDefinition, type Options } from "@anthropic-ai/claude-agent-sdk";

const readOnlyTools = ["Read", "Glob", "Grep"];

export interface GatewayCredential {
  apiKey: string;
  baseUrl: string;
}

export type AgentEvent =
  | { type: "init"; tools: string[] }
  | { type: "text"; source: string; text: string }
  | { type: "tool_use"; source: string; name: string; input: unknown }
  | { type: "tool_result"; source: string; toolUseId: string; isError: boolean }
  | { type: "done"; success: boolean; result: string };

export function createCoordinatorOptions(
  cwd: string,
  model: string,
  gateway: GatewayCredential,
): Options {
  return {
    cwd,
    model,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: gateway.apiKey,
      ANTHROPIC_BASE_URL: gateway.baseUrl,
    },
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
        "Delegate order verification to order-investigator and policy interpretation to policy-specialist.",
        "Launch both specialists together when their work is independent.",
        "Give each specialist the case path because subagents start with fresh context.",
        "Synthesize Verified facts, Applicable policy, and Recommendation sections.",
        "Cite relative paths and do not invent missing evidence.",
      ].join(" "),
    },
  };
}

function createSpecialists(): Record<string, AgentDefinition> {
  return {
    "order-investigator": {
      description: "Verifies case details and the matching order record.",
      prompt: "Read the requested case and orders.json. Report verified facts with relative-path citations. Do not interpret policy.",
      tools: [...readOnlyTools],
      model: "inherit",
      maxTurns: 5,
    },
    "policy-specialist": {
      description: "Finds and interprets the applicable refund policy.",
      prompt: "Read the requested case and policy files. Report the applicable rule with relative-path citations. Do not change files.",
      tools: [...readOnlyTools],
      model: "inherit",
      maxTurns: 5,
    },
  };
}

export async function* runCoordinator(
  prompt: string,
  cwd: string,
  model: string,
  gateway: GatewayCredential,
): AsyncGenerator<AgentEvent> {
  for await (const message of query({
    prompt,
    options: createCoordinatorOptions(cwd, model, gateway),
  })) {
    for (const event of eventsFromMessage(message)) yield event;
  }
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
    return blocks(message.message.content).flatMap((block): AgentEvent[] => {
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
    return blocks(message.message.content).flatMap((block): AgentEvent[] => {
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
    return [{ type: "done", success: false, result: errors.join("\n") || "Agent failed." }];
  }

  return [];
}

function messageSource(message: Record<string, unknown>): string {
  if (typeof message.subagent_type === "string") return message.subagent_type;
  if (typeof message.parent_tool_use_id === "string") return "subagent";
  return "coordinator";
}

function blocks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
