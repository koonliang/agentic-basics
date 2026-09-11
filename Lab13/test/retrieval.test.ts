import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetrieveInput,
  formatRetrievalResults,
  parseQuestion,
} from "../src/retrieval.js";

test("builds a top-five semantic retrieval request", () => {
  assert.deepEqual(buildRetrieveInput("ABCDEFGHIJ", "What evidence is required?"), {
    knowledgeBaseId: "ABCDEFGHIJ",
    retrievalQuery: { text: "What evidence is required?" },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: 5 },
    },
  });
});

test("joins and validates CLI question arguments", () => {
  assert.equal(parseQuestion(["What", "is", "covered?"]), "What is covered?");
  assert.throws(() => parseQuestion([]), /Pass a question/);
});

test("formats scores, sources, metadata, and text", () => {
  assert.equal(formatRetrievalResults([{
    content: { text: "Verify the delivery date.", type: "TEXT" },
    location: { s3Location: { uri: "s3://docs/policy.pdf" }, type: "S3" },
    metadata: { region: "Singapore" },
    score: 0.91234,
  }]), [
    "Result 1 | score=0.9123",
    "Source: s3://docs/policy.pdf",
    'Metadata: {"region":"Singapore"}',
    "Verify the delivery date.",
  ].join("\n"));
});

test("handles no retrieval results", () => {
  assert.equal(formatRetrievalResults([]), "No retrieval results were returned.");
});
