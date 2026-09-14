import assert from "node:assert/strict";
import test from "node:test";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type { RetrievalFilter } from "@aws-sdk/client-bedrock-agent-runtime";

import type { ModelClient, ModelResponse } from "../src/claude.js";
import type { Retriever } from "../src/retrieval.js";
import { compareTableRepresentations } from "../src/table-comparison.js";
import { citedResponse, rawResult } from "./helpers.js";

test("isolates native and image fixtures in a stable order", async () => {
  const filters: RetrievalFilter[] = [];
  const retriever: Retriever = {
    async retrieve(_question, filter) {
      assert.ok(filter);
      filters.push(filter);
      const image = filter.equals?.value === "TEST-TABLE-IMAGE";
      return [rawResult(image ? {
        documentId: "TEST-TABLE-IMAGE",
        filename: "return-processing-table-image.pdf",
        representation: "image",
      } : {})];
    },
  };
  const responses = [
    citedResponse("10%.", "return-processing-table-native.pdf"),
    citedResponse("10%.", "return-processing-table-image.pdf"),
  ];
  const client: ModelClient = {
    async create(_request: MessageCreateParamsNonStreaming): Promise<ModelResponse> {
      const response = responses.shift();
      if (!response) throw new Error("No response.");
      return response;
    },
  };
  const result = await compareTableRepresentations(retriever, client, "Fee?", "model");
  assert.deepEqual(filters.map((filter) => filter.equals?.value), ["TEST-TABLE-NATIVE", "TEST-TABLE-IMAGE"]);
  assert.equal(result.results.image.evidence[0]?.metadata.representation, "image");
});
