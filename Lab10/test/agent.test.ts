import assert from "node:assert/strict";
import test from "node:test";

import { createCoordinatorOptions, eventsFromMessage } from "../src/agent.js";

test("coordinator keeps the specialists read-only and receives gateway credentials", () => {
  const options = createCoordinatorOptions("/workspace", "test-model", {
    apiKey: "test-key",
    baseUrl: "https://gateway.example",
  });

  assert.deepEqual(options.tools, ["Agent", "Read", "Glob", "Grep"]);
  assert.deepEqual(options.agents && Object.keys(options.agents), ["order-investigator", "policy-specialist"]);
  assert.equal(options.permissionMode, "dontAsk");
  assert.equal(options.env?.ANTHROPIC_API_KEY, "test-key");
  assert.equal(options.env?.ANTHROPIC_BASE_URL, "https://gateway.example");
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
