import assert from "node:assert/strict";
import test from "node:test";

import { buildMetadataSidecar, getCorpus } from "../src/corpus.js";

test("uses six versioned documents and excludes table fixtures", () => {
  const corpus = getCorpus("/fixtures");
  assert.equal(corpus.length, 6);
  assert.ok(corpus.some((item) => item.filename === "sg-refund-policy-superseded.pdf"));
  assert.ok(corpus.every((item) => !item.filename.includes("table")));
  assert.equal(
    corpus[0]?.metadataKey,
    "documents/sg-refund-policy-current.pdf.metadata.json",
  );
});

test("builds typed filter-only metadata sidecars", () => {
  const current = getCorpus("/fixtures")[0];
  assert.ok(current);
  const sidecar = JSON.parse(buildMetadataSidecar(current)) as {
    metadataAttributes: Record<string, {
      includeForEmbedding: boolean;
      value: Record<string, unknown>;
    }>;
  };
  assert.deepEqual(Object.keys(sidecar.metadataAttributes), [
    "document_id",
    "title",
    "region",
    "version",
    "status",
    "effective_date",
  ]);
  assert.ok(Object.values(sidecar.metadataAttributes).every(
    (attribute) => attribute.includeForEmbedding === false,
  ));
  assert.deepEqual(sidecar.metadataAttributes.effective_date?.value, {
    type: "NUMBER",
    numberValue: 20260901,
  });
});
