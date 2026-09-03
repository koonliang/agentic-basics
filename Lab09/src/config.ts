import { resolve } from "node:path";

export interface Config {
  model: string;
  port: number;
  workspace: string;
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 8080;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LAB09_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const model = env.CLAUDE_MODEL?.trim();
  if (!model) throw new Error("CLAUDE_MODEL is required.");
  return {
    model,
    port: parsePort(env.LAB09_PORT),
    workspace: resolve("workspace"),
  };
}
