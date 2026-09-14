import { readFile } from "node:fs/promises";

import type { ModelClient } from "./claude.js";
import { retrieveAndAnswer, type CitedAnswer } from "./rag.js";
import { buildDocumentFilter, type EvidenceChunk, type Retriever } from "./retrieval.js";
import {
  tableDocument,
  tableRepresentations,
  type TableRepresentation,
} from "./table-comparison.js";

export interface AnswerEvaluationCase {
  id: string;
  question: string;
  expectedFactGroups: string[][];
}

export interface AnswerCaseResult {
  id: string;
  representation: TableRepresentation;
  passed: boolean;
  missingFactGroups: string[][];
  citations: string[];
  answer: string;
  evidence: EvidenceChunk[];
  reason: string;
}

export interface AnswerEvaluationReport {
  total: number;
  passed: number;
  failed: number;
  cases: AnswerCaseResult[];
}

const casesFile = new URL("../evaluations/multimodal-cases.json", import.meta.url);

export async function loadAnswerEvaluationCases(url = casesFile): Promise<AnswerEvaluationCase[]> {
  const value: unknown = JSON.parse(await readFile(url, "utf8"));
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Answer evaluation cases must be a non-empty array.");
  }
  const cases = value.map(parseCase);
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error("Answer evaluation case IDs must be unique.");
  }
  return cases;
}

export async function evaluateAnswers(
  retriever: Retriever,
  client: ModelClient,
  cases: AnswerEvaluationCase[],
  model: string,
): Promise<AnswerEvaluationReport> {
  const results: AnswerCaseResult[] = [];
  for (const testCase of cases) {
    for (const representation of tableRepresentations) {
      try {
        const source = tableDocument(representation);
        const result = await retrieveAndAnswer(
          retriever,
          client,
          testCase.question,
          model,
          buildDocumentFilter(source.id),
        );
        results.push(scoreAnswer(
          testCase,
          representation,
          result.answer,
          source.filename,
          result.evidence,
        ));
      } catch (error) {
        results.push({
          id: testCase.id,
          representation,
          passed: false,
          missingFactGroups: testCase.expectedFactGroups,
          citations: [],
          answer: "",
          evidence: [],
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const passed = results.filter((result) => result.passed).length;
  return { total: results.length, passed, failed: results.length - passed, cases: results };
}

export function scoreAnswer(
  testCase: AnswerEvaluationCase,
  representation: TableRepresentation,
  answer: CitedAnswer,
  expectedSource: string,
  evidence: EvidenceChunk[] = [],
): AnswerCaseResult {
  const normalized = normalize(answer.text);
  const missingFactGroups = testCase.expectedFactGroups.filter(
    (group) => !group.some((alternative) => normalized.includes(normalize(alternative))),
  );
  const failures: string[] = [];
  if (answer.abstained) failures.push("answer abstained");
  if (!answer.citations.includes(expectedSource)) failures.push(`answer did not cite ${expectedSource}`);
  if (missingFactGroups.length > 0) {
    failures.push(`missing facts: ${missingFactGroups.map((group) => group.join(" or ")).join(", ")}`);
  }
  return {
    id: testCase.id,
    representation,
    passed: failures.length === 0,
    missingFactGroups,
    citations: answer.citations,
    answer: answer.text,
    evidence,
    reason: failures.length === 0 ? "All expected facts and the source citation were present." : failures.join("; "),
  };
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCase(value: unknown): AnswerEvaluationCase {
  if (!isRecord(value) || !validId(value.id) || !nonEmpty(value.question) ||
      !Array.isArray(value.expected_fact_groups) || value.expected_fact_groups.length === 0 ||
      !value.expected_fact_groups.every(nonEmptyStringArray)) {
    throw new Error("Invalid answer evaluation case.");
  }
  return {
    id: value.id,
    question: value.question,
    expectedFactGroups: value.expected_fact_groups,
  };
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
