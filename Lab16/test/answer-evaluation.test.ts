import assert from "node:assert/strict";
import test from "node:test";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";

import {
  evaluateAnswers,
  loadAnswerEvaluationCases,
  scoreAnswer,
  type AnswerEvaluationCase,
} from "../src/answer-evaluation.js";
import type { ModelClient, ModelResponse } from "../src/claude.js";
import type { Retriever } from "../src/retrieval.js";
import { citedResponse, rawResult } from "./helpers.js";

const fixture: AnswerEvaluationCase = {
  id: "fee",
  question: "What fee applies?",
  expectedFactGroups: [["10%", "10 percent"], ["refund"]],
};

test("loads four unique multimodal cases", async () => {
  const cases = await loadAnswerEvaluationCases();
  assert.equal(cases.length, 4);
  assert.equal(new Set(cases.map((item) => item.id)).size, 4);
  const homeAppliances = cases.find((item) => item.id === "singapore-home-appliances");
  assert.match(homeAppliances?.question ?? "", /return window in days/);
  assert.deepEqual(homeAppliances?.expectedFactGroups[1], ["21 days", "21-day", "21 day", "three weeks"]);
});

test("scores normalized alternatives and the expected citation", () => {
  const result = scoreAnswer(fixture, "native", {
    text: "A 10 PERCENT fee applies; the outcome is a REFUND.",
    citations: ["return-processing-table-native.pdf"],
    abstained: false,
  }, "return-processing-table-native.pdf");
  assert.equal(result.passed, true);
  assert.deepEqual(result.missingFactGroups, []);
});

test("reports abstention, missing facts, and a wrong citation", () => {
  const result = scoreAnswer(fixture, "image", {
    text: "No answer.", citations: [], abstained: true,
  }, "return-processing-table-image.pdf");
  assert.equal(result.passed, false);
  assert.match(result.reason, /abstained/);
  assert.match(result.reason, /did not cite/);
  assert.match(result.reason, /10% or 10 percent/);
});

test("accepts equivalent 21-day duration wording", () => {
  const durationCase: AnswerEvaluationCase = {
    id: "duration",
    question: "What is the return window?",
    expectedFactGroups: [["21 days", "21-day", "21 day", "three weeks"]],
  };
  for (const wording of ["21-day", "three weeks"]) {
    const result = scoreAnswer(durationCase, "native", {
      text: `The return window is ${wording}.`,
      citations: ["return-processing-table-native.pdf"],
      abstained: false,
    }, "return-processing-table-native.pdf");
    assert.equal(result.passed, true);
  }
});

test("evaluates every case against both table representations", async () => {
  let image = false;
  const retriever: Retriever = {
    async retrieve(_question, filter) {
      image = filter?.equals?.value === "TEST-TABLE-IMAGE";
      return [rawResult(image ? {
        documentId: "TEST-TABLE-IMAGE",
        filename: "return-processing-table-image.pdf",
        representation: "image",
      } : {}, "10% refund")];
    },
  };
  const client: ModelClient = {
    async create(_request: MessageCreateParamsNonStreaming): Promise<ModelResponse> {
      const filename = image
        ? "return-processing-table-image.pdf"
        : "return-processing-table-native.pdf";
      return citedResponse("10% refund", filename);
    },
  };
  const report = await evaluateAnswers(retriever, client, [fixture], "model");
  assert.equal(report.total, 2);
  assert.equal(report.passed, 2);
  assert.deepEqual(report.cases.map((item) => item.representation), ["native", "image"]);
  assert.equal(report.cases[0]?.answer, "10% refund [return-processing-table-native.pdf]");
  assert.equal(report.cases[0]?.evidence[0]?.text, "10% refund");
});
