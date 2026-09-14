export interface RetrievalConfig {
  knowledgeBaseId: string;
  region: string;
}

export interface IngestionConfig extends RetrievalConfig {
  dataSourceId: string;
  documentBucket: string;
}

export interface DemoConfig extends RetrievalConfig {
  anthropicApiKey: string;
  anthropicBaseUrl?: string;
  model: string;
}

export function loadRetrievalConfig(env: NodeJS.ProcessEnv = process.env): RetrievalConfig {
  return {
    knowledgeBaseId: resourceId(env.BEDROCK_KNOWLEDGE_BASE_ID, "BEDROCK_KNOWLEDGE_BASE_ID"),
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

export function loadDemoConfig(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  const baseUrl = env.ANTHROPIC_BASE_URL?.trim();
  return {
    ...loadRetrievalConfig(env),
    anthropicApiKey: required(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
    model: env.CLAUDE_MODEL?.trim() || "claude-haiku-4-5",
    ...(baseUrl ? { anthropicBaseUrl: baseUrl } : {}),
  };
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
