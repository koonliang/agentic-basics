import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDocumentFilter,
  buildPolicyFilter,
  buildRetrieveInput,
  formatEvidence,
  toEvidenceChunks,
} from "../src/retrieval.js";
import type { FilterCriteria } from "../src/types.js";
import { rawResult } from "./helpers.js";

const criteria: FilterCriteria = {
  region: "Singapore",
  status: "current",
  effectiveOnOrBefore: 20260914,
};

test("builds policy and exact-document filters", () => {
  assert.deepEqual(buildPolicyFilter(criteria), {
    andAll: [
      { orAll: [
        { equals: { key: "region", value: "Singapore" } },
        { equals: { key: "region", value: "Global" } },
      ] },
      { equals: { key: "status", value: "current" } },
      { lessThanOrEquals: { key: "effective_date", value: 20260914 } },
    ],
  });
  assert.deepEqual(buildDocumentFilter("TEST-TABLE-IMAGE"), {
    equals: { key: "document_id", value: "TEST-TABLE-IMAGE" },
  });
});

test("passes an optional filter to Bedrock retrieval", () => {
  const filter = buildDocumentFilter("TEST-TABLE-NATIVE");
  const unfiltered = buildRetrieveInput("ABCDEFGHIJ", "question");
  const filtered = buildRetrieveInput("ABCDEFGHIJ", "question", filter);
  assert.equal(unfiltered.retrievalConfiguration?.vectorSearchConfiguration?.filter, undefined);
  assert.deepEqual(filtered.retrievalConfiguration?.vectorSearchConfiguration?.filter, filter);
  assert.equal(filtered.retrievalConfiguration?.vectorSearchConfiguration?.numberOfResults, 5);
});

test("uses filename metadata for supplemental image locations", () => {
  const chunks = toEvidenceChunks([rawResult()]);
  assert.equal(chunks[0]?.filename, "return-processing-table-native.pdf");
  assert.equal(chunks[0]?.sourceUri, "s3://multimodal/aws/extracted-1.png");
  assert.match(formatEvidence(chunks), /representation=native/);
  assert.match(formatEvidence(chunks), /Electronics \| SG \| 30 days/);
});

test("formats complete evidence for failure diagnostics", () => {
  const text = "x".repeat(300);
  const chunks = toEvidenceChunks([rawResult({}, text)]);
  assert.doesNotMatch(formatEvidence(chunks), /x{300}/);
  assert.match(formatEvidence(chunks, true), /x{300}/);
});

test("rejects missing and invalid multimodal metadata", () => {
  const missing = rawResult();
  delete missing.metadata;
  assert.throws(() => toEvidenceChunks([missing]), /missing document metadata/);
  assert.throws(() => toEvidenceChunks([rawResult({ representation: "scan" as "native" })]), /Invalid representation/);
  assert.throws(() => toEvidenceChunks([rawResult({ status: "draft" as "current" })]), /Invalid status/);
});
