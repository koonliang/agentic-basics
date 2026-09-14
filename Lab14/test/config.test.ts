import assert from "node:assert/strict";
import test from "node:test";

import {
  loadDemoConfig,
  loadIngestionConfig,
  loadRetrievalConfig,
} from "../src/config.js";

test("loads retrieval and ingestion configuration", () => {
  assert.deepEqual(loadRetrievalConfig({
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
  }), {
    knowledgeBaseId: "ABCDEFGHIJ",
    region: "ap-southeast-1",
  });

  assert.deepEqual(loadIngestionConfig({
    AWS_REGION: "ap-southeast-2",
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
    BEDROCK_DATA_SOURCE_ID: "1234567890",
    DOCUMENT_BUCKET: "example-documents",
  }), {
    region: "ap-southeast-2",
    knowledgeBaseId: "ABCDEFGHIJ",
    dataSourceId: "1234567890",
    documentBucket: "example-documents",
  });
});

test("loads Claude configuration and omits an empty base URL", () => {
  assert.deepEqual(loadDemoConfig({
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_BASE_URL: " ",
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
  }), {
    anthropicApiKey: "test-key",
    knowledgeBaseId: "ABCDEFGHIJ",
    model: "claude-haiku-4-5",
    region: "ap-southeast-1",
  });
});

test("rejects missing and malformed required values", () => {
  assert.throws(() => loadRetrievalConfig({}), /BEDROCK_KNOWLEDGE_BASE_ID is required/);
  assert.throws(() => loadRetrievalConfig({
    BEDROCK_KNOWLEDGE_BASE_ID: "short",
  }), /10-character/);
  assert.throws(() => loadDemoConfig({
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
  }), /ANTHROPIC_API_KEY is required/);
});
