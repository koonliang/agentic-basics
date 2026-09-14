import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetrieveInput,
  formatEvidence,
  parseQuestion,
  toEvidenceChunks,
} from "../src/retrieval.js";

test("builds a top-five retrieval request and validates the CLI question", () => {
  assert.deepEqual(buildRetrieveInput("ABCDEFGHIJ", "What evidence is required?"), {
    knowledgeBaseId: "ABCDEFGHIJ",
    retrievalQuery: { text: "What evidence is required?" },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: 5 },
    },
  });
  assert.equal(parseQuestion(["What", "is", "covered?"]), "What is covered?");
  assert.throws(() => parseQuestion([]), /Pass a question/);
});

test("normalizes text chunks from S3 PDF results", () => {
  const chunks = toEvidenceChunks([{
    content: { text: "  Clear photographs are accepted.  ", type: "TEXT" },
    location: {
      s3Location: { uri: "s3://documents/policies/sg%20refund.pdf" },
      type: "S3",
    },
    score: 0.91234,
  }]);

  assert.deepEqual(chunks, [{
    filename: "sg refund.pdf",
    score: 0.91234,
    sourceUri: "s3://documents/policies/sg%20refund.pdf",
    text: "Clear photographs are accepted.",
  }]);
  assert.match(formatEvidence(chunks), /sg refund\.pdf \| score=0\.9123/);
});

test("ignores empty, image-only, non-S3, and non-PDF results", () => {
  assert.deepEqual(toEvidenceChunks([
    { content: { type: "IMAGE", byteContent: "data:image/jpeg;base64,test" } },
    { content: { type: "TEXT", text: "" } },
    {
      content: { type: "TEXT", text: "text" },
      location: { type: "WEB", webLocation: { url: "https://example.com/policy.pdf" } },
    },
    {
      content: { type: "TEXT", text: "text" },
      location: { type: "S3", s3Location: { uri: "s3://documents/notes.txt" } },
    },
  ]), []);
  assert.equal(formatEvidence([]), "No usable text evidence was retrieved.");
});
