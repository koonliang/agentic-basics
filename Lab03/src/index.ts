import { fileURLToPath } from "node:url";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { createAgentOptions, eventsFromMessage, type AgentEvent } from "./agent.js";

const defaultPrompt = [
  "Investigate cases/case-001.md.",
  "Find the matching order and refund policy, then decide whether the customer qualifies for a refund.",
].join(" ");

const prompt = process.argv.slice(2).join(" ").trim() || defaultPrompt;
const workspace = fileURLToPath(new URL("../workspace", import.meta.url));
const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Set ANTHROPIC_API_KEY in Lab03/.env.");
}

let completed = false;
for await (const message of query({
  prompt,
  options: createAgentOptions(workspace, model),
})) {
  for (const event of eventsFromMessage(message)) {
    printEvent(event);
    if (event.type === "done") {
      completed = true;
      if (!event.success) throw new Error(event.result);
    }
  }
}

if (!completed) throw new Error("The Agent SDK stream ended without a result message.");

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
