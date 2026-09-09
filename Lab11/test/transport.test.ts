import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentCardInput,
  createAgentCoreInvocationInput,
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

  const input = createAgentCoreInvocationInput(agent, "investigate", "demo-user");
  assert.equal(input.runtimeSessionId, agent.sessionId);
  assert.equal(input.runtimeUserId, "demo-user");
  const payload = JSON.parse(Buffer.from(input.payload as Uint8Array).toString("utf8"));
  assert.equal(payload.method, "message/send");
  assert.equal(payload.params.message.parts[0].text, "investigate");
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
