import type { IngestionJob, IngestionJobStatistics } from "@aws-sdk/client-bedrock-agent";

export const terminalIngestionStatuses = ["COMPLETE", "FAILED", "STOPPED"] as const;

export interface IngestionJobReader {
  getJob(): Promise<IngestionJob>;
}

export interface WaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onStatus?: (status: string) => void;
}

export async function waitForIngestionJob(
  reader: IngestionJobReader,
  options: WaitOptions = {},
): Promise<IngestionJob> {
  const intervalMs = options.intervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = now();

  while (now() - startedAt <= timeoutMs) {
    const job = await reader.getJob();
    const status = job.status;
    if (!status) throw new Error("The ingestion job response did not include a status.");
    options.onStatus?.(status);

    if (status === "COMPLETE") return job;
    if (status === "FAILED" || status === "STOPPED") {
      const reasons = job.failureReasons?.join("; ") || "No failure reason was returned.";
      throw new Error(`Ingestion ended with ${status}: ${reasons}`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Ingestion did not finish within ${Math.round(timeoutMs / 1_000)} seconds.`);
}

export function formatStatistics(statistics: IngestionJobStatistics | undefined): string {
  if (!statistics) return "No ingestion statistics were returned.";
  return [
    `scanned=${statistics.numberOfDocumentsScanned ?? 0}`,
    `new=${statistics.numberOfNewDocumentsIndexed ?? 0}`,
    `modified=${statistics.numberOfModifiedDocumentsIndexed ?? 0}`,
    `skipped=${statistics.numberOfDocumentsSkipped ?? 0}`,
    `failed=${statistics.numberOfDocumentsFailed ?? 0}`,
    `deleted=${statistics.numberOfDocumentsDeleted ?? 0}`,
  ].join(" ");
}
