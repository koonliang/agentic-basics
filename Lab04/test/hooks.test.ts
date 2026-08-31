import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

import type { AuditEntry } from "../src/audit.js";
import { createPostToolAudit, createWriteGuard } from "../src/hooks.js";

const context = { signal: new AbortController().signal };

test("allows a Markdown draft path to continue to permission evaluation", async () => {
  const entries: AuditEntry[] = [];
  const hook = createWriteGuard("/workspace/drafts", collect(entries));
  const result = await callHook(hook, preToolInput("drafts/reply.md"));

  assert.deepEqual(result, {});
  assert.deepEqual(entries, [{
    event: "write_guard",
    tool: "Write",
    toolUseId: "write-1",
    path: resolve("/workspace/drafts/reply.md"),
    decision: "path_allowed",
  }]);
});

test("blocks traversal outside the drafts directory", async () => {
  const entries: AuditEntry[] = [];
  const hook = createWriteGuard("/workspace/drafts", collect(entries));
  const result = await callHook(hook, preToolInput("drafts/../../orders.md"));

  assert.equal(getPermissionDecision(result), "deny");
  assert.equal(entries[0]?.decision, "path_denied");
});

test("blocks non-Markdown files", async () => {
  const hook = createWriteGuard("/workspace/drafts", async () => {});
  const result = await callHook(hook, preToolInput("drafts/reply.txt"));

  assert.equal(getPermissionDecision(result), "deny");
});

test("records successful tool completion without recording tool output", async () => {
  const entries: AuditEntry[] = [];
  const hook = createPostToolAudit(collect(entries));
  await callHook(hook, {
    hook_event_name: "PostToolUse",
    session_id: "session-1",
    transcript_path: "/tmp/transcript",
    cwd: "/workspace",
    tool_name: "Read",
    tool_input: { file_path: "orders.json" },
    tool_response: "sensitive contents",
    tool_use_id: "read-1",
  });

  assert.deepEqual(entries, [{
    event: "tool_completed",
    tool: "Read",
    toolUseId: "read-1",
    path: resolve("/workspace/orders.json"),
    decision: "success",
  }]);
  assert.doesNotMatch(JSON.stringify(entries), /sensitive contents/);
});

function preToolInput(filePath: string) {
  return {
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    transcript_path: "/tmp/transcript",
    cwd: "/workspace",
    tool_name: "Write",
    tool_input: { file_path: filePath, content: "draft" },
    tool_use_id: "write-1",
  };
}

function collect(entries: AuditEntry[]) {
  return async (entry: AuditEntry) => {
    entries.push(entry);
  };
}

async function callHook(hook: HookCallback, input: object) {
  return hook(input as never, undefined, context);
}

function getPermissionDecision(result: Awaited<ReturnType<HookCallback>>): unknown {
  if (!("hookSpecificOutput" in result)) return undefined;
  return result.hookSpecificOutput?.hookEventName === "PreToolUse"
    ? result.hookSpecificOutput.permissionDecision
    : undefined;
}
