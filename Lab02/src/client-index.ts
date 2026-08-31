import { ClaudeClient } from "./claude-client.js";
import { runClientToolDemo, type ClientDemoEvent, type ToolChoice } from "./client-agent.js";

const { choice, parallel, prompt } = parseArguments(process.argv.slice(2));
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY in Lab02/.env.");

const client = new ClaudeClient(apiKey, process.env.ANTHROPIC_BASE_URL);
const answer = await runClientToolDemo(client, prompt, {
  model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
  choice,
  parallel,
  onEvent: printEvent,
});

console.log(`\n[assistant]\n${answer}`);

function parseArguments(args: string[]): { choice: ToolChoice; parallel: boolean; prompt: string } {
  let choice: ToolChoice = "auto";
  let parallel = true;
  const promptParts: string[] = [];

  for (const argument of args) {
    if (argument.startsWith("--choice=")) {
      const value = argument.slice("--choice=".length);
      if (value !== "auto" && value !== "any" && value !== "none") {
        throw new Error("--choice must be auto, any, or none.");
      }
      choice = value;
    } else if (argument === "--sequential") {
      parallel = false;
    } else {
      promptParts.push(argument);
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Provide a prompt after the options.");
  return { choice, parallel, prompt };
}

function printEvent(event: ClientDemoEvent): void {
  if (event.type === "model_response") {
    console.log(`[model] turn=${event.turn} stop_reason=${event.stopReason}`);
  } else if (event.type === "tool_calls") {
    console.log(`[client] executing ${event.count} tool call(s) ${event.parallel ? "in parallel" : "sequentially"}`);
  } else {
    console.log(`[tool] ${event.name} error=${event.isError} result=${event.output}`);
  }
}
