import assert from "node:assert/strict";
import test from "node:test";

import { runServerToolDemo } from "../src/server-agent.js";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/types.js";

class FakeClient implements ModelClient {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly responses: ModelResponse[]) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response available.");
    return response;
  }
}

test("server web search needs no local tool_result message", async () => {
  const client = new FakeClient([
    {
      stop_reason: "end_turn",
      content: [
        { type: "server_tool_use", id: "search-1", name: "web_search", input: { query: "AI news" } },
        { type: "web_search_tool_result", tool_use_id: "search-1", content: [] },
        { type: "text", text: "Here is the result." },
      ],
    },
  ]);

  const answer = await runServerToolDemo(client, "Search for AI news", { model: "test-model" });

  assert.equal(answer, "Here is the result.");
  assert.equal(client.requests.length, 1);
  assert.deepEqual(client.requests[0]?.messages, [{ role: "user", content: "Search for AI news" }]);
  const sentTools = client.requests[0]?.tools;
  assert.ok(sentTools);
  assert.equal((sentTools[0] as { type: string }).type, "web_search_20250305");
});

test("continues a paused server-tool turn", async () => {
  const pausedContent = [
    { type: "server_tool_use", id: "search-1", name: "web_search", input: { query: "AI news" } },
  ];
  const client = new FakeClient([
    { stop_reason: "pause_turn", content: pausedContent },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Search complete." }] },
  ]);

  const answer = await runServerToolDemo(client, "Search", { model: "test-model" });

  assert.equal(answer, "Search complete.");
  assert.deepEqual(client.requests[1]?.messages[1], { role: "assistant", content: pausedContent });
});

test("stops after repeated pause_turn responses", async () => {
  const client = new FakeClient([
    { stop_reason: "pause_turn", content: [] },
    { stop_reason: "pause_turn", content: [] },
  ]);

  await assert.rejects(
    runServerToolDemo(client, "Search", { model: "test-model", maxTurns: 2 }),
    /exceeded 2 turns/,
  );
});
