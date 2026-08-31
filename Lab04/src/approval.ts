import { createInterface } from "node:readline/promises";

import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

import type { AuditWriter } from "./audit.js";

export type AskApproval = (question: string) => Promise<boolean>;

export function createTerminalApproval(): AskApproval {
  return async (question) => {
    if (!process.stdin.isTTY) return false;

    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await terminal.question(`${question} (y/N): `);
      return answer.trim().toLowerCase() === "y";
    } finally {
      terminal.close();
    }
  };
}

export function createPermissionHandler(askApproval: AskApproval, audit: AuditWriter): CanUseTool {
  return async (toolName, input, { toolUseID }) => {
    if (toolName !== "Write") {
      await audit({
        event: "human_approval",
        tool: toolName,
        toolUseId: toolUseID,
        decision: "denied_unexpected_tool",
      });
      return { behavior: "deny", message: `Approval is not configured for ${toolName}.` };
    }

    const filePath = typeof input.file_path === "string" ? input.file_path : "unknown path";
    const approved = await askApproval(`Allow Write to ${filePath}?`);

    await audit({
      event: "human_approval",
      tool: toolName,
      toolUseId: toolUseID,
      path: filePath,
      decision: approved ? "approved" : "denied",
    });

    if (approved) return { behavior: "allow", updatedInput: input };
    return { behavior: "deny", message: "The user declined to save the draft." };
  };
}
