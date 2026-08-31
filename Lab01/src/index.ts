import { runAgent } from "./agent.js";
import { ClaudeClient } from "./claude-client.js";
import type { AgentEvent } from "./types.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run demo -- "Where is order A1001?"');
  process.exitCode = 1;
} else if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is missing. Copy .env.example to .env and add your API key.",
  );
  process.exitCode = 1;
} else {
  const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";

  const printEvent = (event: AgentEvent): void => {
    if (event.type === "model_response") {
      console.log(
        `[model] turn=${event.turn} stop_reason=${event.stopReason ?? "null"}`,
      );
    } else if (event.type === "tool_call") {
      console.log(`[tool request] ${event.name} ${JSON.stringify(event.input)}`);
    } else {
      const label = event.isError ? "tool error" : "tool result";
      console.log(`[${label}] ${event.output}`);
    }
  };

  try {
    const answer = await runAgent(new ClaudeClient(), prompt, {
      model,
      onEvent: printEvent,
    });
    console.log(`\n[assistant]\n${answer}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
