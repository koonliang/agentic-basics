import assert from "node:assert/strict";
import test from "node:test";

import { buildMetadataSidecar, getCorpus } from "../src/corpus.js";

test("includes six policies and both table representations", () => {
  const corpus = getCorpus("/fixtures");
  assert.equal(corpus.length, 8);
  assert.deepEqual(
    corpus.filter((item) => item.status === "fixture").map((item) => item.representation),
    ["native", "image"],
  );
  assert.ok(corpus.some((item) => item.filename === "sg-refund-policy-superseded.pdf"));
});

test("builds filter-only metadata with stable filenames", () => {
  const fixture = getCorpus("/fixtures")[6];
  assert.ok(fixture);
  const sidecar = JSON.parse(buildMetadataSidecar(fixture)) as {
    metadataAttributes: Record<string, { includeForEmbedding: boolean; value: Record<string, unknown> }>;
  };
  assert.equal(sidecar.metadataAttributes.filename?.value.stringValue, "return-processing-table-native.pdf");
  assert.equal(sidecar.metadataAttributes.representation?.value.stringValue, "native");
  assert.ok(Object.values(sidecar.metadataAttributes).every((item) => item.includeForEmbedding === false));
});
