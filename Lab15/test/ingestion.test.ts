import assert from "node:assert/strict";
import test from "node:test";

import { formatStatistics, waitForIngestionJob } from "../src/ingestion.js";

test("waits for ingestion and formats statistics", async () => {
  const statuses = ["STARTING", "IN_PROGRESS", "COMPLETE"] as const;
  let index = 0;
  const job = await waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890",
        ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0),
        status: statuses[index++] ?? "COMPLETE",
        updatedAt: new Date(0),
      };
    },
  }, { intervalMs: 0, sleep: async () => {} });
  assert.equal(job.status, "COMPLETE");
  assert.equal(formatStatistics({
    numberOfDocumentsScanned: 6,
    numberOfNewDocumentsIndexed: 6,
  }), "scanned=6 new=6 modified=0 skipped=0 failed=0 deleted=0");
});

test("reports ingestion failure", async () => {
  await assert.rejects(() => waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890",
        failureReasons: ["Invalid metadata"],
        ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0),
        status: "FAILED",
        updatedAt: new Date(0),
      };
    },
  }), /FAILED: Invalid metadata/);
});
