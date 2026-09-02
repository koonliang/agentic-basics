import assert from "node:assert/strict";
import test from "node:test";

import { loadEvaluationCases } from "../src/cases.js";
import { createBatchRequests, scoreResults } from "../src/evaluation.js";
import type { BatchResult, EvaluationCase } from "../src/types.js";

test("loads labeled evaluation cases with unique custom IDs", async () => {
  const cases = await loadEvaluationCases();
  assert.equal(cases.length, 5);
  assert.equal(new Set(cases.map((item) => item.customId)).size, cases.length);
});

test("creates one first-turn tool-choice request per case", async () => {
  const cases = await loadEvaluationCases();
  const requests = createBatchRequests(cases, "test-model");

  assert.deepEqual(requests.map((request) => request.custom_id), cases.map((item) => item.customId));
  assert.equal(requests[0]?.params.model, "test-model");
  assert.equal(requests[0]?.params.tool_choice.type, "auto");
  assert.deepEqual(
    requests[0]?.params.tools.map((tool) => tool.name),
    ["get_order_status", "count_orders", "list_order_ids"],
  );
});

test("matches out-of-order results by custom ID", () => {
  const cases: EvaluationCase[] = [
    expectedToolCase("known", "get_order_status", { order_id: "A1001" }),
    noToolCase("greeting"),
  ];
  const results: BatchResult[] = [
    succeeded("greeting", [{ type: "text", text: "Hello!" }]),
    succeeded("known", [{
      type: "tool_use",
      id: "call-1",
      name: "get_order_status",
      input: { order_id: "A1001" },
    }]),
  ];

  const report = scoreResults(cases, results);
  assert.equal(report.passed, 2);
  assert.equal(report.passRate, 1);
  assert.ok(report.cases.every((item) => item.passed));
});

test("distinguishes wrong tool selection from wrong arguments", () => {
  const cases = [
    expectedToolCase("wrong-tool", "count_orders", {}),
    expectedToolCase("wrong-input", "get_order_status", { order_id: "A1001" }),
  ];
  const results = [
    succeeded("wrong-tool", [{ type: "tool_use", name: "list_order_ids", input: {} }]),
    succeeded("wrong-input", [{
      type: "tool_use",
      name: "get_order_status",
      input: { order_id: "A1002" },
    }]),
  ];

  const report = scoreResults(cases, results);
  assert.equal(report.cases[0]?.selectionCorrect, false);
  assert.equal(report.cases[0]?.argumentsCorrect, false);
  assert.equal(report.cases[1]?.selectionCorrect, true);
  assert.equal(report.cases[1]?.argumentsCorrect, false);
  assert.equal(report.failed, 2);
});

test("scores missing and unsuccessful batch entries as failures", () => {
  const cases = [noToolCase("errored"), noToolCase("missing")];
  const results: BatchResult[] = [{
    customId: "errored",
    result: { type: "errored", error: { message: "Bad request" } },
  }];

  const report = scoreResults(cases, results);
  assert.equal(report.failed, 2);
  assert.match(report.cases[0]?.reason ?? "", /errored/);
  assert.match(report.cases[1]?.reason ?? "", /Missing/);
});

function expectedToolCase(
  customId: string,
  expectedTool: string,
  expectedInput: Record<string, unknown>,
): EvaluationCase {
  return { customId, prompt: "test", expectedTool, expectedInput };
}

function noToolCase(customId: string): EvaluationCase {
  return { customId, prompt: "test", expectedTool: null, expectedInput: null };
}

function succeeded(customId: string, content: unknown[]): BatchResult {
  return { customId, result: { type: "succeeded", message: { content } } };
}
