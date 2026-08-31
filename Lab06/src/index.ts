import { runMcpAgent } from "./agent.js";
import { ClaudeClient } from "./claude-client.js";
import { mcpServerUrl } from "./config.js";
import { McpConnection } from "./mcp-client.js";
import type { AgentEvent } from "./types.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run demo -- "How many orders do I have, and what are their details?"');
  process.exitCode = 1;
} else if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is missing. Copy .env.example to .env.");
  process.exitCode = 1;
} else {
  try {
    const connection = await McpConnection.connect(mcpServerUrl(process.env.MCP_SERVER_URL));
    try {
      const answer = await runMcpAgent(
        new ClaudeClient(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_BASE_URL),
        connection,
        prompt,
        {
          model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
          onEvent: printEvent,
        },
      );
      console.log(`\n[assistant]\n${answer}`);
    } finally {
      await connection.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function printEvent(event: AgentEvent): void {
  if (event.type === "tools_discovered") {
    console.log(`[mcp] discovered tools: ${event.names.join(", ")}`);
  } else if (event.type === "model_response") {
    console.log(`[model] turn=${event.turn} stop_reason=${event.stopReason ?? "null"}`);
  } else if (event.type === "tool_call") {
    console.log(`[mcp call] ${event.name} ${JSON.stringify(event.input)}`);
  } else {
    console.log(`[mcp result] ${event.name} error=${event.isError} ${event.output}`);
  }
}
