import { readFile } from "node:fs/promises";

import type { EvaluationCase } from "./types.js";

const casesFile = new URL("../data/evaluation-cases.json", import.meta.url);

export async function loadEvaluationCases(): Promise<EvaluationCase[]> {
  const parsed: unknown = JSON.parse(await readFile(casesFile, "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Evaluation cases must be a non-empty array.");
  }

  const cases = parsed.map(parseCase);
  const ids = new Set(cases.map((item) => item.customId));
  if (ids.size !== cases.length) throw new Error("Evaluation custom_id values must be unique.");
  return cases;
}

function parseCase(value: unknown): EvaluationCase {
  if (!isRecord(value) || typeof value.custom_id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(value.custom_id) ||
      typeof value.prompt !== "string" || value.prompt.trim() === "" ||
      !(typeof value.expected_tool === "string" || value.expected_tool === null) ||
      !(isRecord(value.expected_input) || value.expected_input === null)) {
    throw new Error("Invalid evaluation case.");
  }
  if ((value.expected_tool === null) !== (value.expected_input === null)) {
    throw new Error(`Case ${value.custom_id} must set both expected_tool and expected_input, or neither.`);
  }
  return {
    customId: value.custom_id,
    prompt: value.prompt,
    expectedTool: value.expected_tool,
    expectedInput: value.expected_input,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
