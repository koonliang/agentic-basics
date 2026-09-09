import assert from "node:assert/strict";
import test from "node:test";

import { createAgentCard, createAgentMessage, createUserMessage, textFromMessage } from "../src/a2a.js";

test("builds a discoverable card with v1 and AgentCore-compatible interfaces", () => {
  const card = createAgentCard("order-investigator", "http://localhost:9000");
  assert.equal(card.skills[0]?.id, "verify-order");
  assert.deepEqual(card.supportedInterfaces.map((item) => item.protocolVersion), ["1.0", "0.3"]);
  assert.equal(card.supportedInterfaces[0]?.url, "http://localhost:9000/");
});

test("creates and reads text messages", () => {
  assert.equal(textFromMessage(createUserMessage("hello")), "hello");
  assert.equal(textFromMessage(createAgentMessage("answer", "context")), "answer");
});
