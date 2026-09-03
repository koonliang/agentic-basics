import assert from "node:assert/strict";
import test from "node:test";

import { createCoordinatorOptions, eventsFromMessage } from "../src/agent.js";

test("coordinator keeps the Lab07 specialist restrictions", () => {
  const options = createCoordinatorOptions("/workspace", "test-model");
  assert.deepEqual(options.tools, ["Agent", "Read", "Glob", "Grep"]);
  assert.deepEqual(options.agents && Object.keys(options.agents), ["order-investigator", "policy-specialist"]);
  assert.equal(options.permissionMode, "dontAsk");
});

test("extracts a labeled subagent tool event", () => {
  assert.deepEqual(eventsFromMessage({
    type: "assistant",
    subagent_type: "order-investigator",
    message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "orders.json" } }] },
  }), [{
    type: "tool_use",
    source: "order-investigator",
    name: "Read",
    input: { file_path: "orders.json" },
  }]);
});
