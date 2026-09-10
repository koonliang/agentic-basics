import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import type { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";

import {
  createAgentCardInput,
  createAgentCoreInvocationInput,
  createA2ATransport,
  withConflictRetry,
  type DiscoveredAgent,
} from "../src/transport.js";

const agent: DiscoveredAgent = {
  target: "arn:aws:bedrock-agentcore:ap-southeast-1:123456789012:runtime/order",
  sessionId: "session-id",
  card: {
    name: "Order Investigator",
    description: "Checks orders",
    skills: [{ id: "verify-order", name: "Verify order", description: "Checks an order" }],
  },
};

test("builds AgentCore discovery and invocation inputs with one session", () => {
  assert.deepEqual(createAgentCardInput(agent.target, agent.sessionId), {
    agentRuntimeArn: agent.target,
    qualifier: "DEFAULT",
    runtimeSessionId: agent.sessionId,
  });

  const input = createAgentCoreInvocationInput(agent, "investigate", "demo-user", false, {
    baggage: "session.id=session-1",
    traceId: "trace-1",
    traceParent: "00-11111111111111111111111111111111-2222222222222222-01",
    traceState: "vendor=value",
  });
  assert.equal(input.runtimeSessionId, agent.sessionId);
  assert.equal(input.runtimeUserId, "demo-user");
  assert.equal(input.traceId, "trace-1");
  assert.equal(input.traceParent, "00-11111111111111111111111111111111-2222222222222222-01");
  assert.equal(input.traceState, "vendor=value");
  assert.equal(input.baggage, "session.id=session-1");
  const payload = JSON.parse(Buffer.from(input.payload as Uint8Array).toString("utf8"));
  assert.equal(payload.method, "message/send");
  assert.equal(payload.params.message.parts[0].text, "investigate");
});

test("streams AgentCore traces and returns only the final artifact", async () => {
  const trace = {
    type: "tool_use",
    source: "order-investigator",
    message: "Read orders.json",
    timestamp: "2026-09-09T00:00:00.000Z",
    tool: "Read",
  };
  const frames = [
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: "1", result: { kind: "status-update", metadata: { trace } } })}\n\n`,
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: "1", result: { kind: "artifact-update", artifact: { parts: [{ kind: "text", text: "verified order" }] } } })}\n\n`,
  ].join("");
  let invocationInput: Record<string, unknown> | undefined;
  const client = {
    async send(command: unknown) {
      invocationInput = (command as { input: Record<string, unknown> }).input;
      return { response: Readable.from([frames.slice(0, 47), frames.slice(47)]) };
    },
  } as unknown as BedrockAgentCoreClient;
  const transport = createA2ATransport({
    agentCoreClient: client,
    region: "ap-southeast-1",
    runtimeUserId: "demo-user",
  });
  const traces: unknown[] = [];

  assert.equal(await transport.send(agent, "investigate", (event) => traces.push(event)), "verified order");
  assert.deepEqual(traces, [trace]);
  assert.equal(invocationInput?.accept, "text/event-stream");
  const payload = JSON.parse(Buffer.from(invocationInput?.payload as Uint8Array).toString("utf8"));
  assert.equal(payload.method, "message/stream");
});

test("retries retryable conflicts with exponential delays", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const result = await withConflictRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("conflict"), { name: "RetryableConflictException" });
    return "ok";
  }, async (milliseconds) => { waits.push(milliseconds); });

  assert.equal(result, "ok");
  assert.deepEqual(waits, [100, 200]);
});
