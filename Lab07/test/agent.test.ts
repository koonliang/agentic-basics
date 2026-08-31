import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

import {
  createCoordinatorOptions,
  eventsFromMessage,
  specialistNames,
} from "../src/agent.js";

test("configures a read-only coordinator with two specialists", () => {
  const options = createCoordinatorOptions("/sample/workspace", "test-model");

  assert.equal(options.cwd, "/sample/workspace");
  assert.equal(options.model, "test-model");
  assert.equal(options.maxTurns, 8);
  assert.deepEqual(options.tools, ["Agent", "Read", "Glob", "Grep"]);
  assert.deepEqual(options.allowedTools, ["Agent", "Read", "Glob", "Grep"]);
  assert.equal(options.permissionMode, "dontAsk");
  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(Object.keys(options.agents ?? {}), [...specialistNames]);
});

test("restricts both specialists to read-only filesystem tools", () => {
  const agents = createCoordinatorOptions("/sample/workspace", "test-model").agents;
  assert.ok(agents);

  for (const name of specialistNames) {
    const specialist: AgentDefinition | undefined = agents[name];
    assert.ok(specialist);
    assert.deepEqual(specialist.tools, ["Read", "Glob", "Grep"]);
    assert.equal(specialist.model, "inherit");
    assert.equal(specialist.maxTurns, 5);
  }
});

test("labels coordinator and named specialist assistant events", () => {
  assert.deepEqual(eventsFromMessage({
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      content: [{
        type: "tool_use",
        name: "Agent",
        input: { subagent_type: "order-investigator" },
      }],
    },
  }), [{
    type: "tool_use",
    source: "coordinator",
    name: "Agent",
    input: { subagent_type: "order-investigator" },
  }]);

  assert.deepEqual(eventsFromMessage({
    type: "assistant",
    parent_tool_use_id: "agent-call-1",
    subagent_type: "order-investigator",
    message: {
      content: [
        { type: "tool_use", name: "Grep", input: { pattern: "A1002" } },
        { type: "text", text: "Order A1002 is delivered." },
      ],
    },
  }), [
    {
      type: "tool_use",
      source: "order-investigator",
      name: "Grep",
      input: { pattern: "A1002" },
    },
    {
      type: "text",
      source: "order-investigator",
      text: "Order A1002 is delivered.",
    },
  ]);
});

test("labels subagent tool results and final completion", () => {
  assert.deepEqual(eventsFromMessage({
    type: "user",
    parent_tool_use_id: "agent-call-1",
    message: {
      content: [{ type: "tool_result", tool_use_id: "read-1", content: "evidence" }],
    },
  }), [{
    type: "tool_result",
    source: "subagent",
    toolUseId: "read-1",
    isError: false,
  }]);

  assert.deepEqual(eventsFromMessage({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "The customer qualifies for a refund.",
  }), [{
    type: "done",
    success: true,
    result: "The customer qualifies for a refund.",
  }]);
});

test("turns an SDK failure into a failed completion", () => {
  assert.deepEqual(eventsFromMessage({
    type: "result",
    subtype: "error_max_turns",
    errors: ["Reached the maximum number of turns"],
  }), [{
    type: "done",
    success: false,
    result: "Reached the maximum number of turns",
  }]);
});
