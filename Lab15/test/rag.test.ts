import assert from "node:assert/strict";
import test from "node:test";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type { KnowledgeBaseRetrievalResult } from "@aws-sdk/client-bedrock-agent-runtime";

import type { ModelClient, ModelResponse } from "../src/claude.js";
import {
  ABSTENTION,
  buildGroundedRequest,
  compareVersions,
  readCitedAnswer,
} from "../src/rag.js";
import type { EvidenceChunk, Retriever } from "../src/retrieval.js";
import type { FilterCriteria } from "../src/types.js";

const criteria: FilterCriteria = {
  region: "Singapore",
  status: "current",
  effectiveOnOrBefore: 20260914,
};
const evidence = evidenceChunk("sg-refund-policy-current.pdf", "current");

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
  readonly calls: Array<FilterCriteria | undefined> = [];

  async retrieve(
    _question: string,
    filter?: FilterCriteria,
  ): Promise<KnowledgeBaseRetrievalResult[]> {
    this.calls.push(filter);
    return filter
      ? [retrievalResult("sg-refund-policy-current.pdf", "current")]
      : [retrievalResult("sg-refund-policy-superseded.pdf", "superseded")];
  }
}

test("builds citation documents with policy metadata context", () => {
  const request = buildGroundedRequest("Question?", [evidence], "test-model");
  const content = request.messages[0]?.content;
  assert.ok(Array.isArray(content));
  const document = content[0];
  assert.equal(document?.type, "document");
  if (document?.type !== "document") return;
  assert.equal(document.title, "sg-refund-policy-current.pdf");
  assert.deepEqual(document.citations, { enabled: true });
  assert.match(document.context ?? "", /Status: current/);
  assert.match(document.context ?? "", /Effective date: 20260901/);
  assert.match(String(request.system), /entire response/);
});

test("compares unfiltered and filtered cited answers", async () => {
  const retriever = new FakeRetriever();
  const model = new FakeModel([
    citedResponse("Archived guidance.", "sg-refund-policy-superseded.pdf"),
    citedResponse("Current guidance.", "sg-refund-policy-current.pdf"),
  ]);
  const result = await compareVersions(
    retriever,
    model,
    "What applies?",
    criteria,
    "test-model",
  );

  assert.deepEqual(retriever.calls, [undefined, criteria]);
  assert.equal(model.requests.length, 2);
  assert.match(result.unfiltered.answer.text, /superseded\.pdf/);
  assert.match(result.filtered.answer.text, /current\.pdf/);
});

test("abstains without invoking Claude for an empty branch", async () => {
  const retriever: Retriever = { async retrieve() { return []; } };
  const model = new FakeModel([]);
  const result = await compareVersions(
    retriever,
    model,
    "Unknown?",
    criteria,
    "test-model",
  );
  assert.equal(model.requests.length, 0);
  assert.equal(result.unfiltered.answer.text, ABSTENTION);
  assert.equal(result.filtered.answer.abstained, true);
});

test("requires grounded citations to match retrieved evidence", () => {
  assert.throws(
    () => readCitedAnswer(textResponse("Unsupported."), [evidence]),
    /without a source citation/,
  );
  assert.throws(
    () => readCitedAnswer(citedResponse("Wrong.", "wrong.pdf"), [evidence]),
    /does not match/,
  );
  assert.deepEqual(readCitedAnswer(textResponse(ABSTENTION), [evidence]), {
    text: ABSTENTION,
    citations: [],
    abstained: true,
  });
});

test("canonicalizes abstention followed by text or citations", () => {
  assert.deepEqual(readCitedAnswer(
    textResponse(`${ABSTENTION}\n\nAdditional explanation.`),
    [evidence],
  ), {
    text: ABSTENTION,
    citations: [],
    abstained: true,
  });
  assert.deepEqual(readCitedAnswer({
    content: [
      { type: "text", text: ABSTENTION, citations: null },
      ...citedResponse(" Additional cited explanation.", "wrong.pdf").content,
    ],
    stopReason: "end_turn",
  }, [evidence]), {
    text: ABSTENTION,
    citations: [],
    abstained: true,
  });
});

test("does not canonicalize an abstention sentence appearing later", () => {
  const answer = readCitedAnswer(
    citedResponse(
      `Evidence is incomplete. ${ABSTENTION}`,
      "sg-refund-policy-current.pdf",
    ),
    [evidence],
  );
  assert.equal(answer.abstained, false);
  assert.deepEqual(answer.citations, ["sg-refund-policy-current.pdf"]);
});

function evidenceChunk(
  filename: string,
  status: "current" | "superseded",
): EvidenceChunk {
  return {
    filename,
    sourceUri: `s3://documents/documents/${filename}`,
    text: "Policy text.",
    metadata: {
      documentId: status === "current" ? "POL-SG-REF-2026" : "POL-SG-REF-2025",
      title: "Singapore Refund Policy",
      region: "Singapore",
      version: status === "current" ? "3.2" : "2.4",
      status,
      effectiveDate: status === "current" ? 20260901 : 20250115,
    },
  };
}

function retrievalResult(
  filename: string,
  status: "current" | "superseded",
): KnowledgeBaseRetrievalResult {
  const chunk = evidenceChunk(filename, status);
  return {
    content: { text: chunk.text, type: "TEXT" },
    location: { type: "S3", s3Location: { uri: chunk.sourceUri } },
    metadata: {
      document_id: chunk.metadata.documentId,
      title: chunk.metadata.title,
      region: chunk.metadata.region,
      version: chunk.metadata.version,
      status: chunk.metadata.status,
      effective_date: chunk.metadata.effectiveDate,
    },
  };
}

function textResponse(text: string): ModelResponse {
  return {
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
  };
}

function citedResponse(text: string, documentTitle: string): ModelResponse {
  return {
    content: [{
      type: "text",
      text,
      citations: [{
        cited_text: "Policy text.",
        document_index: 0,
        document_title: documentTitle,
        end_char_index: 12,
        file_id: null,
        start_char_index: 0,
        type: "char_location",
      }],
    }],
    stopReason: "end_turn",
  };
}
