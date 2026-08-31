import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { createAgentOptions, eventsFromMessage, type AgentEvent } from "./agent.js";
import { createPermissionHandler, createTerminalApproval } from "./approval.js";
import { createAuditWriter } from "./audit.js";
import { createPostToolAudit, createWriteGuard } from "./hooks.js";

const defaultPrompt = [
  "Investigate cases/case-001.md and the matching order and refund policy.",
  "Draft a helpful reply to the customer and save it to drafts/reply-case-001.md.",
].join(" ");

const prompt = process.argv.slice(2).join(" ").trim() || defaultPrompt;
const labDirectory = fileURLToPath(new URL("..", import.meta.url));
const workspace = resolve(labDirectory, "workspace");
const draftsDirectory = resolve(workspace, "drafts");
const auditFile = resolve(labDirectory, ".runtime", "audit.jsonl");
const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Set ANTHROPIC_API_KEY in Lab04/.env.");
}

const audit = createAuditWriter(auditFile);
const options = createAgentOptions(
  workspace,
  model,
  createPermissionHandler(createTerminalApproval(), audit),
  createWriteGuard(draftsDirectory, audit),
  createPostToolAudit(audit),
);

let completed = false;
for await (const message of query({ prompt, options })) {
  for (const event of eventsFromMessage(message)) {
    printEvent(event);
    if (event.type === "done") {
      completed = true;
      if (!event.success) throw new Error(event.result);
    }
  }
}

if (!completed) throw new Error("The Agent SDK stream ended without a result message.");
console.log(`[audit] ${auditFile}`);

function printEvent(event: AgentEvent): void {
  if (event.type === "init") {
    console.log(`[sdk] available tools: ${event.tools.join(", ")}`);
  } else if (event.type === "tool_use") {
    console.log(`[tool] ${event.name} ${JSON.stringify(event.input)}`);
  } else if (event.type === "tool_result") {
    console.log(`[tool result] id=${event.toolUseId} error=${event.isError}`);
  } else if (event.type === "text") {
    console.log(`\n[assistant]\n${event.text}`);
  } else {
    console.log(`[sdk] done success=${event.success}`);
  }
}
