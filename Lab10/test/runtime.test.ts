import assert from "node:assert/strict";
import test from "node:test";

import { processInvocation, validateInvocation } from "../src/runtime.js";

test("validates invocation prompts", () => {
  assert.deepEqual(validateInvocation({ prompt: "hello" }), { prompt: "hello" });
  assert.throws(() => validateInvocation({ prompt: " " }), /non-empty string/);
  assert.throws(() => validateInvocation({ prompt: { type: "toolUse" } }), /non-empty string/);
});

test("emits trace events followed by the final result", async () => {
  async function* fakeAgent() {
    yield { type: "init" as const, tools: ["Agent"] };
    yield { type: "done" as const, success: true, result: "Complete" };
  }

  const events = [];
  for await (const event of processInvocation({ prompt: "test" }, fakeAgent)) events.push(event);

  assert.deepEqual(events, [
    { event: "trace", data: { type: "init", tools: ["Agent"] } },
    { event: "final", data: { response: "Complete" } },
  ]);
});

test("fails when the agent has no successful final result", async () => {
  async function* fakeAgent() {
    yield { type: "done" as const, success: false, result: "turn limit" };
  }

  await assert.rejects(async () => {
    for await (const _event of processInvocation({ prompt: "test" }, fakeAgent)) {
      // Consume the stream.
    }
  }, /turn limit/);
});
