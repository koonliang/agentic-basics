import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuditEntry {
  event: "write_guard" | "human_approval" | "tool_completed";
  tool: string;
  toolUseId?: string;
  path?: string;
  decision?: string;
}

export type AuditWriter = (entry: AuditEntry) => Promise<void>;

export function createAuditWriter(filePath: string): AuditWriter {
  return async (entry) => {
    await mkdir(dirname(filePath), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
    await appendFile(filePath, `${line}\n`, "utf8");
  };
}
