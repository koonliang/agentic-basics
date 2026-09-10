import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { GatewayCredential } from "./coordinator.js";
import type { AgentRole } from "./config.js";
import { query } from "./instrumentation.js";
import { createTrace, type TraceSink } from "./trace.js";

const readOnlyTools = ["Read", "Glob", "Grep"];

export function createSpecialistOptions(
  role: Exclude<AgentRole, "coordinator">,
  cwd: string,
  model: string,
  gateway: GatewayCredential,
): Options {
  const instruction = role === "order-investigator"
    ? "Read the requested case and orders.json. Report only verified order facts with relative-path citations. Do not interpret policy."
    : "Read the requested case and policy files. Explain the applicable refund rule with relative-path citations. Do not verify order data beyond the case notes.";

  return {
    cwd,
    model,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: gateway.apiKey,
      ANTHROPIC_BASE_URL: gateway.baseUrl,
    },
    maxTurns: 5,
    tools: [...readOnlyTools],
    allowedTools: [...readOnlyTools],
    permissionMode: "dontAsk",
    settingSources: [],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: instruction,
    },
  };
}

export async function runSpecialist(
  role: Exclude<AgentRole, "coordinator">,
  prompt: string,
  cwd: string,
  model: string,
  gateway: GatewayCredential,
  onTrace: TraceSink = () => {},
): Promise<string> {
  const tools = new Map<string, string>();
  for await (const message of query({
    prompt,
    options: createSpecialistOptions(role, cwd, model, gateway),
  })) {
    for (const block of messageBlocks(message)) {
      if (block.type === "tool_use" && typeof block.name === "string" && typeof block.id === "string") {
        tools.set(block.id, block.name);
        const target = safeToolTarget(block.input, cwd);
        onTrace(createTrace({
          type: "tool_use",
          source: role,
          tool: block.name,
          message: `${block.name}${target ? ` ${target}` : ""}`,
        }));
      }
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const tool = tools.get(block.tool_use_id) || "Tool";
        onTrace(createTrace({
          type: "tool_result",
          source: role,
          tool,
          isError: block.is_error === true,
          message: `${tool} ${block.is_error === true ? "failed" : "completed"}`,
        }));
      }
    }
    if (message.type !== "result") continue;
    if (message.subtype === "success" && typeof message.result === "string" && !message.is_error) {
      return message.result;
    }
    const errors = "errors" in message && Array.isArray(message.errors)
      ? message.errors.filter((error): error is string => typeof error === "string")
      : [];
    throw new Error(errors.join("\n") || `${role} failed.`);
  }
  throw new Error(`${role} completed without a result.`);
}

function messageBlocks(message: unknown): Record<string, unknown>[] {
  if (!isRecord(message) || !isRecord(message.message) || !Array.isArray(message.message.content)) return [];
  return message.message.content.filter(isRecord);
}

function safeToolTarget(input: unknown, cwd: string): string | undefined {
  if (!isRecord(input)) return undefined;
  const value = typeof input.file_path === "string"
    ? input.file_path
    : typeof input.pattern === "string" ? input.pattern : undefined;
  if (!value) return undefined;
  return value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
