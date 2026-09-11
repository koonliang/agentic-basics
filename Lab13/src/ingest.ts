import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  BedrockAgentClient,
  GetIngestionJobCommand,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { loadIngestionConfig } from "./config.js";
import { getCorpus } from "./corpus.js";
import { formatStatistics, waitForIngestionJob } from "./ingestion.js";

const config = loadIngestionConfig();
const s3 = new S3Client({ region: config.region });
const bedrock = new BedrockAgentClient({ region: config.region });
const corpus = getCorpus();

for (const document of corpus) {
  const body = await readFile(document.sourcePath);
  await s3.send(new PutObjectCommand({
    Bucket: config.documentBucket,
    Key: document.key,
    Body: body,
    ContentType: "application/pdf",
  }));
  console.log(`Uploaded s3://${config.documentBucket}/${document.key}`);
}

const started = await bedrock.send(new StartIngestionJobCommand({
  knowledgeBaseId: config.knowledgeBaseId,
  dataSourceId: config.dataSourceId,
  clientToken: randomUUID(),
  description: `Lab13 ingestion of ${corpus.length} current policy documents`,
}));
const ingestionJobId = started.ingestionJob?.ingestionJobId;
if (!ingestionJobId) throw new Error("Bedrock did not return an ingestion job ID.");

console.log(`Started ingestion job ${ingestionJobId}`);
let previousStatus = "";
const completed = await waitForIngestionJob({
  async getJob() {
    const response = await bedrock.send(new GetIngestionJobCommand({
      knowledgeBaseId: config.knowledgeBaseId,
      dataSourceId: config.dataSourceId,
      ingestionJobId,
    }));
    if (!response.ingestionJob) throw new Error("Bedrock did not return the ingestion job.");
    return response.ingestionJob;
  },
}, {
  onStatus(status) {
    if (status === previousStatus) return;
    console.log(`Ingestion status: ${status}`);
    previousStatus = status;
  },
});

console.log(`Ingestion complete: ${formatStatistics(completed.statistics)}`);
