export interface RetrievalConfig {
  knowledgeBaseId: string;
  region: string;
}

export interface IngestionConfig extends RetrievalConfig {
  dataSourceId: string;
  documentBucket: string;
}

export function loadRetrievalConfig(env: NodeJS.ProcessEnv = process.env): RetrievalConfig {
  return {
    knowledgeBaseId: knowledgeBaseId(env.BEDROCK_KNOWLEDGE_BASE_ID),
    region: env.AWS_REGION?.trim() || "ap-southeast-1",
  };
}

export function loadIngestionConfig(env: NodeJS.ProcessEnv = process.env): IngestionConfig {
  return {
    ...loadRetrievalConfig(env),
    dataSourceId: resourceId(env.BEDROCK_DATA_SOURCE_ID, "BEDROCK_DATA_SOURCE_ID"),
    documentBucket: required(env.DOCUMENT_BUCKET, "DOCUMENT_BUCKET"),
  };
}

function knowledgeBaseId(value: string | undefined): string {
  return resourceId(value, "BEDROCK_KNOWLEDGE_BASE_ID");
}

function resourceId(value: string | undefined, name: string): string {
  const result = required(value, name);
  if (!/^[A-Za-z0-9]{10}$/.test(result)) {
    throw new Error(`${name} must be a 10-character Bedrock resource ID.`);
  }
  return result;
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
}
