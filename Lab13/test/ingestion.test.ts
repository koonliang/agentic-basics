import assert from "node:assert/strict";
import test from "node:test";

import { formatStatistics, waitForIngestionJob } from "../src/ingestion.js";

test("waits until ingestion completes", async () => {
  const statuses = ["STARTING", "IN_PROGRESS", "COMPLETE"] as const;
  let index = 0;
  const observed: string[] = [];
  const job = await waitForIngestionJob({
    async getJob() {
      const status = statuses[index++] ?? "COMPLETE";
      return {
        dataSourceId: "1234567890",
        ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0),
        status,
        updatedAt: new Date(0),
      };
    },
  }, {
    intervalMs: 0,
    sleep: async () => {},
    onStatus: (status) => observed.push(status),
  });

  assert.equal(job.status, "COMPLETE");
  assert.deepEqual(observed, statuses);
});

test("reports failed ingestion reasons", async () => {
  await assert.rejects(() => waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890",
        failureReasons: ["Unable to parse document"],
        ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0),
        status: "FAILED",
        updatedAt: new Date(0),
      };
    },
  }), /FAILED: Unable to parse document/);
});

test("times out when ingestion never reaches a terminal state", async () => {
  let time = 0;
  await assert.rejects(() => waitForIngestionJob({
    async getJob() {
      return {
        dataSourceId: "1234567890",
        ingestionJobId: "ABCDEFGHIJ",
        knowledgeBaseId: "KLMNOPQRST",
        startedAt: new Date(0),
        status: "IN_PROGRESS",
        updatedAt: new Date(0),
      };
    },
  }, {
    intervalMs: 1,
    timeoutMs: 2,
    now: () => time++,
    sleep: async () => {},
  }), /within 0 seconds/);
});

test("formats ingestion statistics", () => {
  assert.equal(formatStatistics({
    numberOfDocumentsFailed: 0,
    numberOfDocumentsScanned: 5,
    numberOfNewDocumentsIndexed: 5,
  }), "scanned=5 new=5 modified=0 skipped=0 failed=0 deleted=0");
});
