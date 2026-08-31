import assert from "node:assert/strict";
import { test } from "node:test";

import { runMcpAgent, toClaudeTools } from "../src/agent.js";
import type {
  McpTool,
  McpToolClient,
  McpToolResult,
  ModelClient,
  ModelRequest,
  ModelResponse,
} from "../src/types.js";

const tools: McpTool[] = [
  {
    name: "list_order_ids",
    description: "List order IDs",
    inputSchema: {
      type: "object",
      properties: {},
      $schema: "https://json-schema.org/draft/2020-12/schema",
    },
  },
  {
    name: "get_order_status",
    description: "Get one order",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
    },
  },
];

test("converts discovered MCP schemas to Claude tool definitions", () => {
  assert.deepEqual(toClaudeTools(tools), [
    {
      name: "list_order_ids",
      description: "List order IDs",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "get_order_status",
      description: "Get one order",
      input_schema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  ]);
});

test("rejects a non-object MCP tool schema", () => {
  assert.throws(
    () => toClaudeTools([{ name: "bad", inputSchema: { type: "string" } }]),
    /must have an object input schema/,
  );
});

test("discovers tools and routes every model tool call through MCP", async () => {
  const model = new FakeModel([
    {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "call-1", name: "list_order_ids", input: {} }],
    },
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "call-2", name: "get_order_status", input: { order_id: "A1001" } },
        { type: "tool_use", id: "call-3", name: "get_order_status", input: { order_id: "A1002" } },
      ],
    },
    {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "You have two orders." }],
    },
  ]);
  const mcp = new FakeMcpClient();

  const answer = await runMcpAgent(model, mcp, "Show all my orders", { model: "test-model" });

  assert.equal(answer, "You have two orders.");
  assert.deepEqual(mcp.calls, [
    { name: "list_order_ids", input: {} },
    { name: "get_order_status", input: { order_id: "A1001" } },
    { name: "get_order_status", input: { order_id: "A1002" } },
  ]);
  assert.deepEqual(model.requests[0]?.tools.map((tool) => tool.name), [
    "list_order_ids",
    "get_order_status",
  ]);
  assert.equal(model.requests.length, 3);
});

test("returns MCP failures to Claude as tool errors", async () => {
  const model = new FakeModel([
    {
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "missing-order",
        name: "get_order_status",
        input: { order_id: "A9999" },
      }],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "That order was not found." }] },
  ]);
  const mcp = new FakeMcpClient();

  await runMcpAgent(model, mcp, "Find A9999", { model: "test-model" });

  const toolResults = model.requests[1]?.messages[2]?.content;
  assert.ok(Array.isArray(toolResults));
  assert.deepEqual(toolResults[0], {
    type: "tool_result",
    tool_use_id: "missing-order",
    content: "Order A9999 was not found.",
    is_error: true,
  });
});

class FakeModel implements ModelClient {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly responses: ModelResponse[]) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response configured.");
    return response;
  }
}

class FakeMcpClient implements McpToolClient {
  readonly calls: Array<{ name: string; input: unknown }> = [];

  async listTools(): Promise<McpTool[]> {
    return tools;
  }

  async callTool(name: string, input: unknown): Promise<McpToolResult> {
    this.calls.push({ name, input });
    if (name === "list_order_ids") {
      return { output: JSON.stringify({ order_ids: ["A1001", "A1002"] }), isError: false };
    }
    const orderId = (input as { order_id?: unknown }).order_id;
    if (orderId === "A9999") return { output: "Order A9999 was not found.", isError: true };
    return { output: JSON.stringify({ id: orderId, status: "shipped" }), isError: false };
  }
}
