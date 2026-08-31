import assert from "node:assert/strict";
import { test } from "node:test";
import { runAgent } from "../src/agent.js";
import type {
  AgentEvent,
  ModelClient,
  ModelRequest,
  ModelResponse,
} from "../src/types.js";

class FakeClient implements ModelClient {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly responses: ModelResponse[]) {}

  async create(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response configured");
    return response;
  }
}

function toolResponse(name = "get_order_status", input: unknown = { order_id: "A1001" }): ModelResponse {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tool-1", name, input }],
  };
}

const finalResponse: ModelResponse = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "Order A1001 is in transit." }],
};

test("executes a requested tool and returns its result to Claude", async () => {
  const client = new FakeClient([toolResponse(), finalResponse]);
  const events: AgentEvent[] = [];

  const answer = await runAgent(client, "Where is A1001?", {
    model: "test-model",
    onEvent: (event) => events.push(event),
  });

  assert.equal(answer, "Order A1001 is in transit.");
  assert.equal(client.requests.length, 2);

  const toolResultMessage = client.requests[1]?.messages[2];
  assert.equal(toolResultMessage?.role, "user");
  assert.ok(Array.isArray(toolResultMessage?.content));

  const toolResult = toolResultMessage.content[0] as Record<string, unknown>;
  assert.equal(toolResult.type, "tool_result");
  assert.equal(toolResult.tool_use_id, "tool-1");
  assert.equal(toolResult.is_error, false);
  assert.match(String(toolResult.content), /in_transit/);
  assert.equal(events.filter(({ type }) => type === "tool_call").length, 1);
});

test("returns malformed tool input as a tool error", async () => {
  const client = new FakeClient([
    toolResponse("get_order_status", { wrong_field: "A1001" }),
    finalResponse,
  ]);

  await runAgent(client, "Where is my order?", { model: "test-model" });

  const message = client.requests[1]?.messages[2];
  assert.ok(Array.isArray(message?.content));
  const result = message.content[0] as Record<string, unknown>;
  assert.equal(result.is_error, true);
  assert.match(String(result.content), /requires a string order_id/);
});

test("returns an unknown tool as a tool error", async () => {
  const client = new FakeClient([toolResponse("delete_order"), finalResponse]);

  await runAgent(client, "Delete my order", { model: "test-model" });

  const message = client.requests[1]?.messages[2];
  assert.ok(Array.isArray(message?.content));
  const result = message.content[0] as Record<string, unknown>;
  assert.equal(result.is_error, true);
  assert.match(String(result.content), /Unknown tool/);
});

test("returns an unknown order as a tool error", async () => {
  const client = new FakeClient([
    toolResponse("get_order_status", { order_id: "A9999" }),
    finalResponse,
  ]);

  await runAgent(client, "Where is A9999?", { model: "test-model" });

  const message = client.requests[1]?.messages[2];
  assert.ok(Array.isArray(message?.content));
  const result = message.content[0] as Record<string, unknown>;
  assert.equal(result.is_error, true);
  assert.match(String(result.content), /was not found/);
});

test("stops after the configured turn limit", async () => {
  const client = new FakeClient([toolResponse(), toolResponse()]);

  await assert.rejects(
    () =>
      runAgent(client, "Keep checking", {
        model: "test-model",
        maxTurns: 2,
      }),
    /exceeded the maximum of 2 turns/,
  );
});

test("reports refusal and unexpected stop reasons", async () => {
  await assert.rejects(
    () =>
      runAgent(
        new FakeClient([{ stop_reason: "refusal", content: [] }]),
        "request",
        { model: "test-model" },
      ),
    /refused/,
  );

  await assert.rejects(
    () =>
      runAgent(
        new FakeClient([{ stop_reason: "max_tokens", content: [] }]),
        "request",
        { model: "test-model" },
      ),
    /stopped unexpectedly: max_tokens/,
  );
});
