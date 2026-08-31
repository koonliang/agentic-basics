import {
  isRecord,
  textFrom,
  type ConversationMessage,
  type ModelClient,
} from "./types.js";

export interface ServerDemoOptions {
  model: string;
  maxTurns?: number;
  onEvent?: (event: ServerDemoEvent) => void;
}

export type ServerDemoEvent =
  | { type: "model_response"; turn: number; stopReason: string | null }
  | { type: "server_tool_use"; name: string }
  | { type: "server_tool_result"; blockType: string };

export const webSearchTool = {
  type: "web_search_20250305",
  name: "web_search",
};

export async function runServerToolDemo(
  client: ModelClient,
  prompt: string,
  options: ServerDemoOptions,
): Promise<string> {
  const messages: ConversationMessage[] = [{ role: "user", content: prompt }];
  const maxTurns = options.maxTurns ?? 3;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await client.create({
      model: options.model,
      max_tokens: 2_048,
      messages,
      tools: [webSearchTool],
    });

    options.onEvent?.({ type: "model_response", turn, stopReason: response.stop_reason });
    for (const block of response.content) {
      if (!isRecord(block) || typeof block.type !== "string") continue;
      if (block.type === "server_tool_use") {
        options.onEvent?.({
          type: "server_tool_use",
          name: typeof block.name === "string" ? block.name : "unknown",
        });
      } else if (block.type.endsWith("_tool_result")) {
        options.onEvent?.({ type: "server_tool_result", blockType: block.type });
      }
    }

    const answer = textFrom(response.content);
    if (response.stop_reason === "end_turn" && answer) return answer;
    if (response.stop_reason === "refusal") throw new Error(answer || "Claude refused the request.");

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    throw new Error(`Unexpected stop reason: ${response.stop_reason ?? "null"}`);
  }

  throw new Error(`The server tool loop exceeded ${maxTurns} turns.`);
}
