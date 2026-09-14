import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeBaseRetrievalResult } from "@aws-sdk/client-bedrock-agent-runtime";

import {
  buildRetrievalFilter,
  buildRetrieveInput,
  formatEvidence,
  formatFilter,
  toEvidenceChunks,
} from "../src/retrieval.js";
import type { FilterCriteria } from "../src/types.js";

const criteria: FilterCriteria = {
  region: "Singapore",
  status: "current",
  effectiveOnOrBefore: 20260914,
};

test("builds region-or-global, status, and effective-date filters", () => {
  assert.deepEqual(buildRetrievalFilter(criteria), {
    andAll: [
      {
        orAll: [
          { equals: { key: "region", value: "Singapore" } },
          { equals: { key: "region", value: "Global" } },
        ],
      },
      { equals: { key: "status", value: "current" } },
      { lessThanOrEquals: { key: "effective_date", value: 20260914 } },
    ],
  });
  assert.deepEqual(buildRetrievalFilter({ ...criteria, region: "Global" }).andAll?.[0], {
    equals: { key: "region", value: "Global" },
  });
});

test("adds filters only to the filtered retrieval request", () => {
  const unfiltered = buildRetrieveInput("ABCDEFGHIJ", "question");
  const filtered = buildRetrieveInput("ABCDEFGHIJ", "question", criteria);
  assert.equal(unfiltered.retrievalConfiguration?.vectorSearchConfiguration?.filter, undefined);
  assert.deepEqual(
    filtered.retrievalConfiguration?.vectorSearchConfiguration?.filter,
    buildRetrievalFilter(criteria),
  );
  assert.equal(filtered.retrievalConfiguration?.vectorSearchConfiguration?.numberOfResults, 5);
});

test("normalizes and displays returned policy metadata", () => {
  const chunks = toEvidenceChunks([result()]);
  assert.deepEqual(chunks[0]?.metadata, {
    documentId: "POL-SG-REF-2026",
    title: "Singapore Refund Policy",
    region: "Singapore",
    version: "3.2",
    status: "current",
    effectiveDate: 20260901,
  });
  assert.match(formatEvidence(chunks), /region=Singapore status=current version=3\.2 effective=2026-09-01/);
  assert.equal(
    formatFilter(criteria),
    "region=Singapore or Global status=current effective_date<=2026-09-14",
  );
});

test("rejects missing and invalid metadata", () => {
  const missing = result();
  delete missing.metadata;
  assert.throws(() => toEvidenceChunks([missing]), /missing policy metadata/);
  assert.throws(() => toEvidenceChunks([result({ effective_date: "20260901" })]), /must be a number/);
  assert.throws(() => toEvidenceChunks([result({ status: "draft" })]), /Invalid status/);
});

function result(overrides: Record<string, unknown> = {}): KnowledgeBaseRetrievalResult {
  return {
    content: { text: "Accept clear photographs.", type: "TEXT" },
    location: {
      type: "S3",
      s3Location: { uri: "s3://documents/documents/sg-refund-policy-current.pdf" },
    },
    metadata: {
      document_id: "POL-SG-REF-2026",
      title: "Singapore Refund Policy",
      region: "Singapore",
      version: "3.2",
      status: "current",
      effective_date: 20260901,
      ...overrides,
    },
    score: 0.9,
  };
}
