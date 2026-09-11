import assert from "node:assert/strict";
import test from "node:test";

import { loadIngestionConfig, loadRetrievalConfig } from "../src/config.js";

test("loads retrieval config with the default region", () => {
  assert.deepEqual(loadRetrievalConfig({
    BEDROCK_KNOWLEDGE_BASE_ID: "ABCDEFGHIJ",
  }), {
    knowledgeBaseId: "ABCDEFGHIJ",
    region: "ap-southeast-1",
  });
});

test("loads all ingestion identifiers", () => {
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

test("rejects missing and malformed resource IDs", () => {
  assert.throws(() => loadRetrievalConfig({}), /BEDROCK_KNOWLEDGE_BASE_ID is required/);
  assert.throws(() => loadRetrievalConfig({
    BEDROCK_KNOWLEDGE_BASE_ID: "short",
  }), /10-character/);
});
