import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig, parsePort } from "../src/config.js";

test("uses AgentCore defaults", () => {
  const config = loadConfig({
    ANTHROPIC_BASE_URL: "https://gateway.example",
    CLAUDE_MODEL: "test-model",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.region, "ap-southeast-1");
  assert.equal(config.credentialProviderName, "agentic-basics-lab10-gateway");
  assert.equal(config.localApiKey, undefined);
});

test("accepts local overrides", () => {
  const config = loadConfig({
    ANTHROPIC_API_KEY: "local-key",
    ANTHROPIC_BASE_URL: "https://gateway.example",
    AWS_REGION: "us-east-1",
    CLAUDE_MODEL: "test-model",
    GATEWAY_API_KEY_PROVIDER_NAME: "test-provider",
    LAB10_PORT: "18080",
  });

  assert.equal(config.localApiKey, "local-key");
  assert.equal(config.port, 18080);
  assert.equal(config.region, "us-east-1");
  assert.equal(config.credentialProviderName, "test-provider");
});

test("rejects missing gateway configuration", () => {
  assert.throws(() => loadConfig({ CLAUDE_MODEL: "test-model" }), /ANTHROPIC_BASE_URL/);
  assert.throws(() => loadConfig({ ANTHROPIC_BASE_URL: "https://gateway.example" }), /CLAUDE_MODEL/);
});

test("rejects invalid local ports", () => {
  for (const value of ["0", "65536", "1.5", "not-a-port"]) {
    assert.throws(() => parsePort(value), /LAB10_PORT/);
  }
});
