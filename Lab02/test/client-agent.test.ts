import assert from "node:assert/strict";
import test from "node:test";

import { runClientToolDemo } from "../src/client-agent.js";
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

test("runs count_orders and changes forced tool choice to auto", async () => {
  const client = new FakeClient([
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "call-1", name: "count_orders", input: {} }],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "You have 3 orders." }] },
  ]);

  const answer = await runClientToolDemo(client, "How many orders?", {
    model: "test-model",
    choice: "any",
  });

  assert.equal(answer, "You have 3 orders.");
  assert.equal(client.requests[0]?.tool_choice?.type, "any");
  assert.equal(client.requests[1]?.tool_choice?.type, "auto");
  const resultMessage = client.requests[1]?.messages[2];
  assert.equal(resultMessage?.role, "user");
  assert.ok(Array.isArray(resultMessage?.content));
  const toolResult = resultMessage.content[0] as { content: string };
  assert.deepEqual(JSON.parse(toolResult.content), { count: 3 });
});

test("discovers order IDs before retrieving all order details", async () => {
  const client = new FakeClient([
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "list-1", name: "list_order_ids", input: {} }],
    },
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "status-1", name: "get_order_status", input: { order_id: "A1001" } },
        { type: "tool_use", id: "status-2", name: "get_order_status", input: { order_id: "A1002" } },
        { type: "tool_use", id: "status-3", name: "get_order_status", input: { order_id: "A1003" } },
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "You have 3 orders. Here are their details." }] },
  ]);

  const answer = await runClientToolDemo(client, "How many orders do I have, and what are their details?", {
    model: "test-model",
  });

  assert.equal(answer, "You have 3 orders. Here are their details.");

  const discoveryContent = client.requests[1]?.messages[2]?.content;
  assert.ok(Array.isArray(discoveryContent));
  const discoveryResult = discoveryContent[0] as { content: string };

  const detailContent = client.requests[2]?.messages[4]?.content;
  assert.ok(Array.isArray(detailContent));
  assert.equal(detailContent.length, 3);
  assert.deepEqual(
    detailContent.map((block) => (block as { tool_use_id: string }).tool_use_id),
    ["status-1", "status-2", "status-3"],
  );
});

test("returns multiple tool results in one message", async () => {
  const client = new FakeClient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "call-1", name: "get_order_status", input: { order_id: "A1001" } },
        { type: "tool_use", id: "call-2", name: "get_order_status", input: { order_id: "A1002" } },
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Compared both orders." }] },
  ]);

  await runClientToolDemo(client, "Compare A1001 and A1002", { model: "test-model" });

  const content = client.requests[1]?.messages[2]?.content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 2);
  assert.deepEqual(content.map((block) => (block as { tool_use_id: string }).tool_use_id), ["call-1", "call-2"]);
});

test("marks a missing order as a tool error", async () => {
  const client = new FakeClient([
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "call-1", name: "get_order_status", input: { order_id: "A9999" } }],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "That order was not found." }] },
  ]);

  await runClientToolDemo(client, "Find A9999", { model: "test-model" });

  const content = client.requests[1]?.messages[2]?.content;
  assert.ok(Array.isArray(content));
  assert.equal((content[0] as { is_error: boolean }).is_error, true);
});

test("tool choice none can finish without a tool call", async () => {
  const client = new FakeClient([
    { stop_reason: "end_turn", content: [{ type: "text", text: "I cannot inspect orders without a tool." }] },
  ]);

  const answer = await runClientToolDemo(client, "How many orders?", {
    model: "test-model",
    choice: "none",
  });

  assert.equal(answer, "I cannot inspect orders without a tool.");
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0]?.tools, undefined);
  assert.equal(client.requests[0]?.tool_choice, undefined);
});

test("rejects a tool request returned while tools are disabled", async () => {
  const client = new FakeClient([
    { stop_reason: "tool_use", content: [] },
  ]);

  await assert.rejects(
    runClientToolDemo(client, "How many orders?", {
      model: "test-model",
      choice: "none",
    }),
    /tool request while tools were disabled/,
  );
});

test("explains a tool_use stop without a valid tool block", async () => {
  const client = new FakeClient([
    { stop_reason: "tool_use", content: [{ type: "text", text: "Calling a tool" }] },
  ]);

  await assert.rejects(
    runClientToolDemo(client, "How many orders?", { model: "test-model" }),
    /without a valid tool_use content block/,
  );
});

test("sequential mode disables parallel tool use in the API request", async () => {
  const client = new FakeClient([
    { stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] },
  ]);

  await runClientToolDemo(client, "Hello", { model: "test-model", parallel: false });
  assert.equal(client.requests[0]?.tool_choice?.disable_parallel_tool_use, true);
});
