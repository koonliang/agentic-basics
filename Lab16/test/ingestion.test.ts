import assert from "node:assert/strict";
import test from "node:test";

import { formatStatistics, waitForIngestionJob } from "../src/ingestion.js";

test("waits for ingestion and formats statistics", async () => {
  const statuses = ["STARTING", "IN_PROGRESS", "COMPLETE"] as const;
  let index = 0;
  const job = await waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890", ingestionJobId: "ABCDEFGHIJ", knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0), status: statuses[index++] ?? "COMPLETE", updatedAt: new Date(0),
      };
    },
  }, { intervalMs: 0, sleep: async () => {} });
  assert.equal(job.status, "COMPLETE");
  assert.equal(formatStatistics({ numberOfDocumentsScanned: 8, numberOfNewDocumentsIndexed: 8 }),
    "scanned=8 new=8 modified=0 skipped=0 failed=0 deleted=0");
});

test("reports parser ingestion failure", async () => {
  await assert.rejects(() => waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890", failureReasons: ["Parser failed"], ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST", startedAt: new Date(0), status: "FAILED", updatedAt: new Date(0),
      };
    },
  }), /FAILED: Parser failed/);
});
