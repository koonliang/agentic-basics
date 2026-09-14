import assert from "node:assert/strict";
import test from "node:test";

import { loadDemoConfig, loadIngestionConfig } from "../src/config.js";

test("loads ingestion and demo configuration", () => {
  assert.equal(loadIngestionConfig({
    AWS_REGION: "ap-southeast-2",
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
    BEDROCK_DATA_SOURCE_ID: "1234567890",
    DOCUMENT_BUCKET: "documents",
  }).region, "ap-southeast-2");
  assert.deepEqual(loadDemoConfig({
    ANTHROPIC_API_KEY: "key",
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
  }), {
    anthropicApiKey: "key",
    knowledgeBaseId: "ABCDEFGHIJ",
    model: "claude-haiku-4-5",
    region: "ap-southeast-1",
  });
});

test("rejects missing and malformed configuration", () => {
  assert.throws(() => loadDemoConfig({}), /BEDROCK_KNOWLEDGE_BASE_ID is required/);
  assert.throws(() => loadDemoConfig({
    ANTHROPIC_API_KEY: "key", BEDROCK_KNOWLEDGE_BASE_ID: "short",
  }), /10-character/);
});
