import assert from "node:assert/strict";
import test from "node:test";

import type { CanUseTool, HookCallback } from "@anthropic-ai/claude-agent-sdk";

import { createAgentOptions } from "../src/agent.js";

const allow: CanUseTool = async (_toolName, input) => ({ behavior: "allow", updatedInput: input });
const noOpHook: HookCallback = async () => ({});

test("exposes Write but auto-approves only read tools", () => {
  const options = createAgentOptions("/workspace", "test-model", allow, noOpHook, noOpHook);

  assert.deepEqual(options.tools, ["Read", "Glob", "Grep", "Write"]);
  assert.deepEqual(options.allowedTools, ["Read", "Glob", "Grep"]);
  assert.equal(options.permissionMode, "default");
  assert.deepEqual(options.settingSources, []);
  assert.equal(options.canUseTool, allow);
  assert.equal(options.hooks?.PreToolUse?.[0]?.matcher, "Write");
});
