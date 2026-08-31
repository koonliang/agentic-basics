import { ClaudeClient } from "./claude-client.js";
import { runServerToolDemo, type ServerDemoEvent } from "./server-agent.js";

const prompt = process.argv.slice(2).join(" ").trim();
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!prompt) throw new Error("Provide a prompt, for example: npm run server -- \"Search for today's AI news\"");
if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY in Lab02/.env.");

const client = new ClaudeClient(apiKey, process.env.ANTHROPIC_BASE_URL);
const answer = await runServerToolDemo(client, prompt, {
  model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
  onEvent: printEvent,
});

console.log(`\n[assistant]\n${answer}`);

function printEvent(event: ServerDemoEvent): void {
  if (event.type === "model_response") {
    console.log(`[model] turn=${event.turn} stop_reason=${event.stopReason}`);
  } else if (event.type === "server_tool_use") {
    console.log(`[anthropic server] using ${event.name}`);
  } else {
    console.log(`[anthropic server] returned ${event.blockType}`);
  }
}
