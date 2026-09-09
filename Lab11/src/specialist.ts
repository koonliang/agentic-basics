import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

import type { GatewayCredential } from "./coordinator.js";
import type { AgentRole } from "./config.js";

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
): Promise<string> {
  for await (const message of query({
    prompt,
    options: createSpecialistOptions(role, cwd, model, gateway),
  })) {
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
