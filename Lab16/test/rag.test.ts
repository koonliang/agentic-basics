import assert from "node:assert/strict";
import test from "node:test";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type { RetrievalFilter } from "@aws-sdk/client-bedrock-agent-runtime";

import type { ModelClient, ModelResponse } from "../src/claude.js";
import { ABSTENTION, buildGroundedRequest, readCitedAnswer, retrieveAndAnswer } from "../src/rag.js";
import { toEvidenceChunks, type Retriever } from "../src/retrieval.js";
import { citedResponse, rawResult } from "./helpers.js";

class FakeModel implements ModelClient {
  readonly requests: MessageCreateParamsNonStreaming[] = [];
  constructor(private readonly responses: ModelResponse[]) {}
  async create(request: MessageCreateParamsNonStreaming): Promise<ModelResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error("No response configured.");
    return response;
  }
}

test("builds citation documents with representation context", () => {
  const evidence = toEvidenceChunks([rawResult()]);
  const request = buildGroundedRequest("Question?", evidence, "test-model");
  const content = request.messages[0]?.content;
  assert.ok(Array.isArray(content));
  const document = content[0];
  assert.equal(document?.type, "document");
  if (document?.type !== "document") return;
  assert.equal(document.title, "return-processing-table-native.pdf");
  assert.match(document.context ?? "", /Representation: native/);
  assert.match(String(request.system), /entire response/);
});

test("retrieves with a supplied document filter and returns a cited answer", async () => {
  const calls: Array<RetrievalFilter | undefined> = [];
  const retriever: Retriever = {
    async retrieve(_question, filter) {
      calls.push(filter);
      return [rawResult()];
    },
  };
  const model = new FakeModel([citedResponse("The fee is 10%.", "return-processing-table-native.pdf")]);
  const filter: RetrievalFilter = { equals: { key: "document_id", value: "TEST-TABLE-NATIVE" } };
  const result = await retrieveAndAnswer(retriever, model, "Fee?", "test-model", filter);
  assert.deepEqual(calls, [filter]);
  assert.deepEqual(result.answer.citations, ["return-processing-table-native.pdf"]);
});

test("abstains without invoking Claude when no usable evidence exists", async () => {
  const model = new FakeModel([]);
  const result = await retrieveAndAnswer({ async retrieve() { return []; } }, model, "Unknown?", "model");
  assert.equal(result.answer.text, ABSTENTION);
  assert.equal(model.requests.length, 0);
});

test("requires matching citations and canonicalizes extended abstentions", () => {
  const evidence = toEvidenceChunks([rawResult()]);
  assert.throws(() => readCitedAnswer({
    content: [{ type: "text", text: "Unsupported.", citations: null }], stopReason: "end_turn",
  }, evidence), /without a source citation/);
  assert.throws(() => readCitedAnswer(citedResponse("Wrong.", "wrong.pdf"), evidence), /does not match/);
  assert.deepEqual(readCitedAnswer({
    content: [{ type: "text", text: `${ABSTENTION}\nExplanation.`, citations: null }], stopReason: "end_turn",
  }, evidence), { text: ABSTENTION, citations: [], abstained: true });
});
