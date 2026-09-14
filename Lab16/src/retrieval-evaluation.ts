import { readFile } from "node:fs/promises";

import { parseDate } from "./dates.js";
import {
  buildPolicyFilter,
  toEvidenceChunks,
  type EvidenceChunk,
  type Retriever,
} from "./retrieval.js";
import {
  policyStatuses,
  regions,
  type FilterCriteria,
  type PolicyStatus,
  type Region,
} from "./types.js";

export interface RetrievalEvaluationCase {
  id: string;
  question: string;
  criteria: FilterCriteria;
  unfilteredMustInclude: string[];
  filteredMustInclude: string[];
  filteredMustExclude: string[];
}

export interface RetrievalCaseResult {
  id: string;
  passed: boolean;
  unfilteredSources: string[];
  filteredSources: string[];
  reason: string;
}

const casesFile = new URL("../evaluations/retrieval-cases.json", import.meta.url);

export async function loadRetrievalEvaluationCases(url = casesFile): Promise<RetrievalEvaluationCase[]> {
  const value: unknown = JSON.parse(await readFile(url, "utf8"));
  if (!Array.isArray(value) || value.length === 0) throw new Error("Retrieval cases must be a non-empty array.");
  const cases = value.map(parseCase);
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Retrieval case IDs must be unique.");
  return cases;
}

export async function evaluateRetrieval(
  retriever: Retriever,
  cases: RetrievalEvaluationCase[],
): Promise<RetrievalCaseResult[]> {
  const results: RetrievalCaseResult[] = [];
  for (const testCase of cases) {
    const unfiltered = toEvidenceChunks(await retriever.retrieve(testCase.question));
    const filtered = toEvidenceChunks(await retriever.retrieve(
      testCase.question,
      buildPolicyFilter(testCase.criteria),
    ));
    results.push(scoreRetrieval(testCase, unfiltered, filtered));
  }
  return results;
}

export function scoreRetrieval(
  testCase: RetrievalEvaluationCase,
  unfiltered: EvidenceChunk[],
  filtered: EvidenceChunk[],
): RetrievalCaseResult {
  const unfilteredSources = uniqueSources(unfiltered);
  const filteredSources = uniqueSources(filtered);
  const failures: string[] = [];
  checkIncludes("unfiltered", unfilteredSources, testCase.unfilteredMustInclude, failures);
  checkIncludes("filtered", filteredSources, testCase.filteredMustInclude, failures);
  for (const source of testCase.filteredMustExclude) {
    if (filteredSources.includes(source)) failures.push(`filtered results included ${source}`);
  }
  for (const chunk of filtered) {
    if (!matchesCriteria(chunk, testCase.criteria)) failures.push(`${chunk.filename} did not satisfy the filter metadata`);
  }
  return {
    id: testCase.id,
    passed: failures.length === 0,
    unfilteredSources,
    filteredSources,
    reason: failures.length === 0 ? "All source and metadata checks passed." : failures.join("; "),
  };
}

function parseCase(value: unknown): RetrievalEvaluationCase {
  if (!isRecord(value) || !validId(value.id) || !nonEmpty(value.question) ||
      !isRecord(value.filter) || !stringArray(value.unfiltered_must_include) ||
      !stringArray(value.filtered_must_include) || !stringArray(value.filtered_must_exclude)) {
    throw new Error("Invalid retrieval case.");
  }
  const region = value.filter.region;
  const status = value.filter.status;
  const asOf = value.filter.as_of;
  if (typeof region !== "string" || !regions.includes(region as Region) ||
      typeof status !== "string" || !policyStatuses.includes(status as PolicyStatus) ||
      typeof asOf !== "string") throw new Error(`Case ${value.id} has an invalid filter.`);
  return {
    id: value.id,
    question: value.question,
    criteria: {
      region: region as Region,
      status: status as PolicyStatus,
      effectiveOnOrBefore: parseDate(asOf),
    },
    unfilteredMustInclude: value.unfiltered_must_include,
    filteredMustInclude: value.filtered_must_include,
    filteredMustExclude: value.filtered_must_exclude,
  };
}

function matchesCriteria(chunk: EvidenceChunk, criteria: FilterCriteria): boolean {
  const regionMatches = chunk.metadata.region === "Global" || chunk.metadata.region === criteria.region;
  return regionMatches && chunk.metadata.status === criteria.status &&
    chunk.metadata.effectiveDate <= criteria.effectiveOnOrBefore;
}

function checkIncludes(label: string, actual: string[], expected: string[], failures: string[]): void {
  for (const source of expected) {
    if (!actual.includes(source)) failures.push(`${label} results omitted ${source}`);
  }
}

function uniqueSources(chunks: EvidenceChunk[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.filename))];
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
