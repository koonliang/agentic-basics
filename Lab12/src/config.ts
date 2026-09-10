import { resolve } from "node:path";

export const agentRoles = ["coordinator", "order-investigator", "policy-specialist"] as const;
export type AgentRole = (typeof agentRoles)[number];

export interface Config {
  baseUrl: string;
  credentialProviderName: string;
  localApiKey?: string;
  model: string;
  orderAgentTarget?: string;
  policyAgentTarget?: string;
  port: number;
  publicUrl: string;
  region: string;
  role: AgentRole;
  runtimeUserId: string;
  workspace: string;
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 9000;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("A2A_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

export function parseRole(value: string | undefined): AgentRole {
  const role = value?.trim() || "coordinator";
  if (!agentRoles.includes(role as AgentRole)) {
    throw new Error(`AGENT_ROLE must be one of: ${agentRoles.join(", ")}.`);
  }
  return role as AgentRole;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const role = parseRole(env.AGENT_ROLE);
  const port = parsePort(env.A2A_PORT);
  const localApiKey = env.ANTHROPIC_API_KEY?.trim();
  const orderAgentTarget = env.ORDER_AGENT_TARGET?.trim();
  const policyAgentTarget = env.POLICY_AGENT_TARGET?.trim();

  if (role === "coordinator" && (!orderAgentTarget || !policyAgentTarget)) {
    throw new Error("ORDER_AGENT_TARGET and POLICY_AGENT_TARGET are required for the coordinator.");
  }

  return {
    baseUrl: required(env.ANTHROPIC_BASE_URL, "ANTHROPIC_BASE_URL"),
    credentialProviderName: env.GATEWAY_API_KEY_PROVIDER_NAME?.trim() || "agentic-basics-lab12-gateway",
    ...(localApiKey ? { localApiKey } : {}),
    model: required(env.CLAUDE_MODEL, "CLAUDE_MODEL"),
    ...(orderAgentTarget ? { orderAgentTarget } : {}),
    ...(policyAgentTarget ? { policyAgentTarget } : {}),
    port,
    publicUrl: env.AGENTCORE_RUNTIME_URL?.trim() || env.AGENT_PUBLIC_URL?.trim() || `http://127.0.0.1:${port}/`,
    region: env.AWS_REGION?.trim() || "ap-southeast-1",
    role,
    runtimeUserId: env.AGENT_RUNTIME_USER_ID?.trim() || "lab12-demo-user",
    workspace: resolve("workspace"),
  };
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
}
