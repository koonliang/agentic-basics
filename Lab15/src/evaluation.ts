import { readFile } from "node:fs/promises";

import { parseDate } from "./dates.js";
import { toEvidenceChunks, type EvidenceChunk, type Retriever } from "./retrieval.js";
import {
  policyStatuses,
  regions,
  type FilterCriteria,
  type PolicyStatus,
  type Region,
} from "./types.js";

export interface EvaluationCase {
  id: string;
  question: string;
  criteria: FilterCriteria;
  unfilteredMustInclude: string[];
  filteredMustInclude: string[];
  filteredMustExclude: string[];
}

export interface CaseResult {
  id: string;
  passed: boolean;
  unfilteredSources: string[];
  filteredSources: string[];
  reason: string;
}

export interface EvaluationReport {
  total: number;
  passed: number;
  failed: number;
  cases: CaseResult[];
}

const casesFile = new URL("../evaluations/cases.json", import.meta.url);

export async function loadEvaluationCases(url = casesFile): Promise<EvaluationCase[]> {
  const value: unknown = JSON.parse(await readFile(url, "utf8"));
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Evaluation cases must be a non-empty array.");
  }
  const cases = value.map(parseCase);
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error("Evaluation case IDs must be unique.");
  }
  return cases;
}

export async function evaluateRetrieval(
  retriever: Retriever,
  cases: EvaluationCase[],
): Promise<EvaluationReport> {
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const unfiltered = toEvidenceChunks(await retriever.retrieve(testCase.question));
    const filtered = toEvidenceChunks(
      await retriever.retrieve(testCase.question, testCase.criteria),
    );
    results.push(scoreCase(testCase, unfiltered, filtered));
  }
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    cases: results,
  };
}

export function scoreCase(
  testCase: EvaluationCase,
  unfiltered: EvidenceChunk[],
  filtered: EvidenceChunk[],
): CaseResult {
  const unfilteredSources = uniqueSources(unfiltered);
  const filteredSources = uniqueSources(filtered);
  const failures: string[] = [];
  checkIncludes("unfiltered", unfilteredSources, testCase.unfilteredMustInclude, failures);
  checkIncludes("filtered", filteredSources, testCase.filteredMustInclude, failures);
  for (const source of testCase.filteredMustExclude) {
    if (filteredSources.includes(source)) failures.push(`filtered results included ${source}`);
  }
  for (const chunk of filtered) {
    if (!matchesCriteria(chunk, testCase.criteria)) {
      failures.push(`${chunk.filename} did not satisfy the filter metadata`);
    }
  }
  return {
    id: testCase.id,
    passed: failures.length === 0,
    unfilteredSources,
    filteredSources,
    reason: failures.length === 0 ? "All source and metadata checks passed." : failures.join("; "),
  };
}

function parseCase(value: unknown): EvaluationCase {
  if (!isRecord(value) || !validId(value.id) || !nonEmpty(value.question) ||
      !isRecord(value.filter) ||
      !stringArray(value.unfiltered_must_include) ||
      !stringArray(value.filtered_must_include) ||
      !stringArray(value.filtered_must_exclude)) {
    throw new Error("Invalid evaluation case.");
  }
  const region = value.filter.region;
  const status = value.filter.status;
  const asOf = value.filter.as_of;
  if (typeof region !== "string" || !regions.includes(region as Region) ||
      typeof status !== "string" || !policyStatuses.includes(status as PolicyStatus) ||
      typeof asOf !== "string") {
    throw new Error(`Case ${value.id} has an invalid filter.`);
  }
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
  return regionMatches &&
    chunk.metadata.status === criteria.status &&
    chunk.metadata.effectiveDate <= criteria.effectiveOnOrBefore;
}

function checkIncludes(
  label: string,
  actual: string[],
  expected: string[],
  failures: string[],
): void {
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
