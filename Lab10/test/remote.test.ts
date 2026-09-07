import assert from "node:assert/strict";
import test from "node:test";

import { createInvocationInput } from "../src/remote.js";

test("constructs a streaming DEFAULT runtime invocation", () => {
  const input = createInvocationInput({
    agentRuntimeArn: "arn:aws:bedrock-agentcore:ap-southeast-1:123456789012:runtime/example-1234567890",
    prompt: "investigate",
    sessionId: "11111111-1111-4111-8111-111111111111",
    userId: "test-user",
  });

  assert.equal(input.qualifier, "DEFAULT");
  assert.equal(input.accept, "text/event-stream");
  assert.equal(input.contentType, "application/json");
  assert.equal(input.runtimeSessionId, "11111111-1111-4111-8111-111111111111");
  assert.equal(input.runtimeUserId, "test-user");
  assert.equal(Buffer.from(input.payload as Uint8Array).toString(), '{"prompt":"investigate"}');
});
