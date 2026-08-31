import assert from "node:assert/strict";
import test from "node:test";

import { createAgentOptions, eventsFromMessage } from "../src/agent.js";

test("configures an isolated read-only agent", () => {
  const options = createAgentOptions("/sample/workspace", "test-model");

  assert.equal(options.cwd, "/sample/workspace");
  assert.equal(options.model, "test-model");
  assert.equal(options.maxTurns, 6);
  assert.deepEqual(options.tools, ["Read", "Glob", "Grep"]);
  assert.deepEqual(options.allowedTools, ["Read", "Glob", "Grep"]);
  assert.equal(options.permissionMode, "dontAsk");
  assert.deepEqual(options.settingSources, []);
});

test("extracts initialization and assistant events", () => {
  assert.deepEqual(
    eventsFromMessage({ type: "system", subtype: "init", tools: ["Read", "Glob", "Grep"] }),
    [{ type: "init", tools: ["Read", "Glob", "Grep"] }],
  );

  assert.deepEqual(
    eventsFromMessage({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "tool-1", name: "Grep", input: { pattern: "A1002" } },
          { type: "text", text: "I found the matching order." },
        ],
      },
    }),
    [
      { type: "tool_use", name: "Grep", input: { pattern: "A1002" } },
      { type: "text", text: "I found the matching order." },
    ],
  );
});

test("extracts tool results and successful completion", () => {
  assert.deepEqual(
    eventsFromMessage({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tool-1", content: "match" }] },
    }),
    [{ type: "tool_result", toolUseId: "tool-1", isError: false }],
  );

  assert.deepEqual(
    eventsFromMessage({ type: "result", subtype: "success", is_error: false, result: "Approved." }),
    [{ type: "done", success: true, result: "Approved." }],
  );
});

test("turns an SDK failure into a failed completion event", () => {
  assert.deepEqual(
    eventsFromMessage({
      type: "result",
      subtype: "error_max_turns",
      errors: ["Reached the maximum number of turns"],
    }),
    [{ type: "done", success: false, result: "Reached the maximum number of turns" }],
  );
});
