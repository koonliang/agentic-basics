import assert from "node:assert/strict";
import test from "node:test";

import type { AuditEntry } from "../src/audit.js";
import { createPermissionHandler } from "../src/approval.js";

const permissionContext = {
  signal: new AbortController().signal,
  toolUseID: "write-1",
  requestId: "request-1",
};

test("allows an approved Write request", async () => {
  const entries: AuditEntry[] = [];
  const handler = createPermissionHandler(async () => true, collect(entries));
  const input = { file_path: "drafts/reply.md", content: "Hello" };

  const result = await handler("Write", input, permissionContext);

  assert.deepEqual(result, { behavior: "allow", updatedInput: input });
  assert.equal(entries[0]?.decision, "approved");
});

test("denies a Write request rejected by the user", async () => {
  const entries: AuditEntry[] = [];
  const handler = createPermissionHandler(async () => false, collect(entries));

  const result = await handler(
    "Write",
    { file_path: "drafts/reply.md", content: "Hello" },
    permissionContext,
  );

  assert.equal(result?.behavior, "deny");
  assert.equal(entries[0]?.decision, "denied");
});

test("denies unexpected tools without asking the user", async () => {
  let asked = false;
  const handler = createPermissionHandler(
    async () => {
      asked = true;
      return true;
    },
    async () => {},
  );

  const result = await handler("Bash", { command: "echo hello" }, permissionContext);

  assert.equal(result?.behavior, "deny");
  assert.equal(asked, false);
});

function collect(entries: AuditEntry[]) {
  return async (entry: AuditEntry) => {
    entries.push(entry);
  };
}
