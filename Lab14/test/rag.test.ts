import assert from "node:assert/strict";
import test from "node:test";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type { KnowledgeBaseRetrievalResult } from "@aws-sdk/client-bedrock-agent-runtime";

import type { ModelClient, ModelResponse } from "../src/claude.js";
import {
  ABSTENTION,
  buildGroundedRequest,
  buildUngroundedRequest,
  compareAnswers,
  readCitedAnswer,
  readTextAnswer,
} from "../src/rag.js";
import type { EvidenceChunk, Retriever } from "../src/retrieval.js";

const evidence: EvidenceChunk[] = [{
  filename: "sg-refund-policy-current.pdf",
  score: 0.9,
  sourceUri: "s3://documents/documents/sg-refund-policy-current.pdf",
  text: "Accept clear photographs.",
}];

class FakeModel implements ModelClient {
  readonly requests: MessageCreateParamsNonStreaming[] = [];

  constructor(private readonly responses: ModelResponse[]) {}

  async create(request: MessageCreateParamsNonStreaming): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response configured.");
    return response;
  }
}

class FakeRetriever implements Retriever {
  readonly questions: string[] = [];

  constructor(private readonly results: KnowledgeBaseRetrievalResult[]) {}

  async retrieve(question: string): Promise<KnowledgeBaseRetrievalResult[]> {
    this.questions.push(question);
    return this.results;
  }
}

test("builds separate ungrounded and citation-enabled grounded requests", () => {
  const ungrounded = buildUngroundedRequest("Question?", "test-model");
  assert.equal(ungrounded.messages[0]?.content, "Question?");

  const grounded = buildGroundedRequest("Question?", evidence, "test-model");
  const content = grounded.messages[0]?.content;
  assert.ok(Array.isArray(content));
  const document = content[0];
  assert.equal(document?.type, "document");
  if (document?.type !== "document") return;
  assert.equal(document.title, "sg-refund-policy-current.pdf");
  assert.deepEqual(document.citations, { enabled: true });
  assert.deepEqual(document.source, {
    type: "text",
    media_type: "text/plain",
    data: "Accept clear photographs.",
  });
  assert.match(String(grounded.system), /only facts explicitly stated/);
  assert.match(String(grounded.system), new RegExp(ABSTENTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("compares an ungrounded answer with a cited grounded answer", async () => {
  const model = new FakeModel([
    textResponse("Perhaps a photograph is needed."),
    citedResponse("Clear photographs are accepted."),
  ]);
  const retriever = new FakeRetriever([retrievalResult()]);
  const result = await compareAnswers(retriever, model, "What evidence?", {
    model: "test-model",
  });

  assert.equal(model.requests.length, 2);
  assert.deepEqual(retriever.questions, ["What evidence?"]);
  assert.equal(result.ungrounded, "Perhaps a photograph is needed.");
  assert.equal(
    result.grounded.text,
    "Clear photographs are accepted. [sg-refund-policy-current.pdf]",
  );
  assert.deepEqual(result.grounded.citations, ["sg-refund-policy-current.pdf"]);
  assert.equal(result.grounded.abstained, false);
});

test("abstains without a grounded model call when retrieval has no usable text", async () => {
  const model = new FakeModel([textResponse("An ungrounded answer.")]);
  const result = await compareAnswers(
    new FakeRetriever([]),
    model,
    "Unknown question?",
    { model: "test-model" },
  );

  assert.equal(model.requests.length, 1);
  assert.equal(result.grounded.text, ABSTENTION);
  assert.equal(result.grounded.abstained, true);
});

test("accepts the exact model abstention without citations", () => {
  assert.deepEqual(readCitedAnswer(textResponse(ABSTENTION), evidence), {
    text: ABSTENTION,
    citations: [],
    abstained: true,
  });
});

test("rejects uncited and mismatched grounded answers", () => {
  assert.throws(
    () => readCitedAnswer(textResponse("Unsupported answer."), evidence),
    /without a source citation/,
  );
  assert.throws(
    () => readCitedAnswer(citedResponse("Answer.", "wrong.pdf"), evidence),
    /does not match/,
  );
});

test("rejects refusal, truncation, and empty answers", () => {
  assert.throws(
    () => readTextAnswer({ content: [], stopReason: "refusal" }),
    /refused/,
  );
  assert.throws(
    () => readTextAnswer({ content: [], stopReason: "max_tokens" }),
    /stopped unexpectedly/,
  );
  assert.throws(
    () => readTextAnswer({ content: [], stopReason: "end_turn" }),
    /no answer text/,
  );
});

function textResponse(text: string): ModelResponse {
  return {
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
  };
}

function citedResponse(
  text: string,
  documentTitle = "sg-refund-policy-current.pdf",
): ModelResponse {
  return {
    content: [{
      type: "text",
      text,
      citations: [{
        cited_text: "Accept clear photographs.",
        document_index: 0,
        document_title: documentTitle,
        end_char_index: 25,
        file_id: null,
        start_char_index: 0,
        type: "char_location",
      }],
    }],
    stopReason: "end_turn",
  };
}

function retrievalResult(): KnowledgeBaseRetrievalResult {
  return {
    content: { text: "Accept clear photographs.", type: "TEXT" },
    location: {
      s3Location: { uri: "s3://documents/documents/sg-refund-policy-current.pdf" },
      type: "S3",
    },
    score: 0.9,
  };
}
