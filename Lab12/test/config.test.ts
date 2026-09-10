import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig, parsePort, parseRole } from "../src/config.js";

test("uses the A2A port and coordinator defaults", () => {
  const config = loadConfig({
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_MODEL: "model",
    ORDER_AGENT_TARGET: "http://order:9000",
    POLICY_AGENT_TARGET: "http://policy:9000",
  });

  assert.equal(config.port, 9000);
  assert.equal(config.role, "coordinator");
  assert.equal(config.runtimeUserId, "lab12-demo-user");
});

test("accepts specialist roles without coordinator targets", () => {
  const config = loadConfig({
    AGENT_ROLE: "order-investigator",
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_MODEL: "model",
  });
  assert.equal(config.role, "order-investigator");
});

test("validates ports, roles, and coordinator targets", () => {
  assert.throws(() => parsePort("8080.5"), /A2A_PORT/);
  assert.throws(() => parseRole("unknown"), /AGENT_ROLE/);
  assert.throws(() => loadConfig({
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_MODEL: "model",
  }), /ORDER_AGENT_TARGET/);
});
