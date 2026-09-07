import { resolve } from "node:path";

export interface Config {
  baseUrl: string;
  credentialProviderName: string;
  localApiKey?: string;
  model: string;
  port: number;
  region: string;
  workspace: string;
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 8080;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LAB10_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = required(env.ANTHROPIC_BASE_URL, "ANTHROPIC_BASE_URL");
  const model = required(env.CLAUDE_MODEL, "CLAUDE_MODEL");
  const localApiKey = env.ANTHROPIC_API_KEY?.trim();

  return {
    baseUrl,
    credentialProviderName: env.GATEWAY_API_KEY_PROVIDER_NAME?.trim() || "agentic-basics-lab10-gateway",
    ...(localApiKey ? { localApiKey } : {}),
    model,
    port: parsePort(env.LAB10_PORT),
    region: env.AWS_REGION?.trim() || "ap-southeast-1",
    workspace: resolve("workspace"),
  };
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
}
