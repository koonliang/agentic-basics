import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeBaseRetrievalResult } from "@aws-sdk/client-bedrock-agent-runtime";

import {
  evaluateRetrieval,
  loadEvaluationCases,
  scoreCase,
  type EvaluationCase,
} from "../src/evaluation.js";
import type { EvidenceChunk, Retriever } from "../src/retrieval.js";
import type { FilterCriteria, PolicyMetadata } from "../src/types.js";

const criteria: FilterCriteria = {
  region: "Singapore",
  status: "current",
  effectiveOnOrBefore: 20260914,
};
const fixture: EvaluationCase = {
  id: "version-check",
  question: "Which version applies?",
  criteria,
  unfilteredMustInclude: ["sg-refund-policy-superseded.pdf"],
  filteredMustInclude: ["sg-refund-policy-current.pdf"],
  filteredMustExclude: ["sg-refund-policy-superseded.pdf"],
};

test("loads four unique regression cases", async () => {
  const cases = await loadEvaluationCases();
  assert.equal(cases.length, 4);
  assert.equal(new Set(cases.map((item) => item.id)).size, 4);
  assert.equal(cases[0]?.criteria.effectiveOnOrBefore, 20260914);
});

test("passes source and filter metadata checks", () => {
  const result = scoreCase(fixture, [chunk("sg-refund-policy-superseded.pdf", {
    status: "superseded",
    effectiveDate: 20250115,
  })], [chunk("sg-refund-policy-current.pdf")]);
  assert.equal(result.passed, true);
  assert.match(result.reason, /passed/);
});

test("reports stale, missing, and metadata-violating filtered results", () => {
  const result = scoreCase(fixture, [], [
    chunk("sg-refund-policy-superseded.pdf", {
      status: "superseded",
      effectiveDate: 20250115,
    }),
    chunk("future.pdf", { region: "Global", effectiveDate: 20261001 }),
  ]);
  assert.equal(result.passed, false);
  assert.match(result.reason, /unfiltered results omitted/);
  assert.match(result.reason, /filtered results omitted/);
  assert.match(result.reason, /filtered results included/);
  assert.match(result.reason, /did not satisfy/);
});

test("runs each evaluation case with and without its filter", async () => {
  const calls: Array<FilterCriteria | undefined> = [];
  const retriever: Retriever = {
    async retrieve(_question, filter) {
      calls.push(filter);
      return filter
        ? [rawResult("sg-refund-policy-current.pdf", metadata())]
        : [rawResult("sg-refund-policy-superseded.pdf", metadata({
            status: "superseded",
            effectiveDate: 20250115,
          }))];
    },
  };
  const report = await evaluateRetrieval(retriever, [fixture]);
  assert.equal(report.passed, 1);
  assert.equal(report.failed, 0);
  assert.deepEqual(calls, [undefined, criteria]);
});

function chunk(
  filename: string,
  overrides: Partial<PolicyMetadata> = {},
): EvidenceChunk {
  return {
    filename,
    sourceUri: `s3://documents/documents/${filename}`,
    text: "Policy text.",
    metadata: metadata(overrides),
  };
}

function metadata(overrides: Partial<PolicyMetadata> = {}): PolicyMetadata {
  return {
    documentId: "POL-SG-REF-2026",
    title: "Singapore Refund Policy",
    region: "Singapore",
    version: "3.2",
    status: "current",
    effectiveDate: 20260901,
    ...overrides,
  };
}

function rawResult(
  filename: string,
  value: PolicyMetadata,
): KnowledgeBaseRetrievalResult {
  return {
    content: { type: "TEXT", text: "Policy text." },
    location: { type: "S3", s3Location: { uri: `s3://documents/documents/${filename}` } },
    metadata: {
      document_id: value.documentId,
      title: value.title,
      region: value.region,
      version: value.version,
      status: value.status,
      effective_date: value.effectiveDate,
    },
  };
}
