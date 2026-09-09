import assert from "node:assert/strict";
import test from "node:test";

import { coordinate, type CoordinatorModel, type SpecialistTarget } from "../src/coordinator.js";
import type { A2ATransport, DiscoveredAgent } from "../src/transport.js";

const targets: SpecialistTarget[] = [
  { id: "order-investigator", target: "http://order" },
  { id: "policy-specialist", target: "http://policy" },
];

test("runs selected specialists concurrently and synthesizes their results", async () => {
  let started = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const transport = fakeTransport(async (agent) => {
    started += 1;
    if (started === 2) release?.();
    await gate;
    return `${agent.card.name} result`;
  });
  const model: CoordinatorModel = {
    async route() {
      return { delegations: targets.map(({ id }) => ({ id, task: "investigate" })) };
    },
    async synthesize(_prompt, results) {
      assert.equal(started, 2);
      assert.equal(results.every((result) => result.success), true);
      return "final answer";
    },
  };

  assert.equal(await coordinate({ model, prompt: "case", targets, transport }), "final answer");
});

test("passes a specialist failure to synthesis", async () => {
  const transport = fakeTransport(async (agent) => {
    if (agent.target.includes("policy")) throw new Error("policy unavailable");
    return "order result";
  });
  const model: CoordinatorModel = {
    async route() {
      return { delegations: targets.map(({ id }) => ({ id, task: "investigate" })) };
    },
    async synthesize(_prompt, results) {
      assert.equal(results[0]?.success, true);
      assert.deepEqual(results[1], {
        id: "policy-specialist",
        result: "policy unavailable",
        success: false,
      });
      return "partial answer";
    },
  };

  assert.equal(await coordinate({ model, prompt: "case", targets, transport }), "partial answer");
});

test("lets synthesis report when every selected specialist fails", async () => {
  const model: CoordinatorModel = {
    async route() {
      return { delegations: targets.map(({ id }) => ({ id, task: "investigate" })) };
    },
    async synthesize(_prompt, results) {
      assert.equal(results.every((result) => !result.success), true);
      return "evidence unavailable";
    },
  };
  assert.equal(await coordinate({
    model,
    prompt: "case",
    targets,
    transport: fakeTransport(async () => { throw new Error("unavailable"); }),
  }), "evidence unavailable");
});

test("returns a direct answer when no specialist is selected", async () => {
  const model: CoordinatorModel = {
    async route() { return { delegations: [], directAnswer: "hello" }; },
    async synthesize() { throw new Error("should not synthesize"); },
  };
  assert.equal(await coordinate({
    model,
    prompt: "hello",
    targets,
    transport: fakeTransport(async () => "unused"),
  }), "hello");
});

function fakeTransport(send: A2ATransport["send"]): A2ATransport {
  return {
    async discover(target): Promise<DiscoveredAgent> {
      return {
        target,
        sessionId: `${target}-session`,
        card: {
          name: target.includes("order") ? "Order Investigator" : "Policy Specialist",
          description: "Specialist",
          skills: [{ id: "skill", name: "Skill", description: "Investigate" }],
        },
      };
    },
    send,
  };
}
