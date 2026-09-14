import assert from "node:assert/strict";
import test from "node:test";

import { corpusFilenames, getCorpus } from "../src/corpus.js";

test("uses exactly the five current policy documents", () => {
  assert.deepEqual(corpusFilenames, [
    "sg-refund-policy-current.pdf",
    "au-refund-policy-current.pdf",
    "shipping-investigation-guide.pdf",
    "product-warranty-guide.pdf",
    "support-escalation-guide.pdf",
  ]);
  assert.equal(corpusFilenames.some((name) => name.includes("superseded")), false);
  assert.equal(corpusFilenames.some((name) => name.includes("table")), false);
});

test("builds deterministic S3 keys", () => {
  const [first] = getCorpus("/fixtures");
  assert.deepEqual(first, {
    filename: "sg-refund-policy-current.pdf",
    key: "documents/sg-refund-policy-current.pdf",
    sourcePath: "/fixtures/sg-refund-policy-current.pdf",
  });
});
