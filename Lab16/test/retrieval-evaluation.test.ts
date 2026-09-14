import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRetrievalEvaluationCases,
  scoreRetrieval,
  type RetrievalEvaluationCase,
} from "../src/retrieval-evaluation.js";
import { toEvidenceChunks } from "../src/retrieval.js";
import { rawResult } from "./helpers.js";

test("loads the retained version-aware regression cases", async () => {
  const cases = await loadRetrievalEvaluationCases();
  assert.equal(cases.length, 4);
  assert.equal(cases[0]?.criteria.effectiveOnOrBefore, 20260914);
});

test("scores expected and excluded retrieval sources", () => {
  const fixture: RetrievalEvaluationCase = {
    id: "version-check",
    question: "Which version?",
    criteria: { region: "Singapore", status: "current", effectiveOnOrBefore: 20260914 },
    unfilteredMustInclude: ["sg-refund-policy-superseded.pdf"],
    filteredMustInclude: ["sg-refund-policy-current.pdf"],
    filteredMustExclude: ["sg-refund-policy-superseded.pdf"],
  };
  const unfiltered = toEvidenceChunks([rawResult({
    documentId: "POL-SG-REF-2025", filename: "sg-refund-policy-superseded.pdf",
    region: "Singapore", status: "superseded", representation: "mixed", effectiveDate: 20250115,
  })]);
  const filtered = toEvidenceChunks([rawResult({
    documentId: "POL-SG-REF-2026", filename: "sg-refund-policy-current.pdf",
    region: "Singapore", status: "current", representation: "mixed",
  })]);
  assert.equal(scoreRetrieval(fixture, unfiltered, filtered).passed, true);
});
