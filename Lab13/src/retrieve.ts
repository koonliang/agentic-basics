import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

import { loadRetrievalConfig } from "./config.js";
import {
  buildRetrieveInput,
  formatRetrievalResults,
  parseQuestion,
} from "./retrieval.js";

const question = parseQuestion(process.argv.slice(2));
const config = loadRetrievalConfig();
const client = new BedrockAgentRuntimeClient({ region: config.region });
const response = await client.send(new RetrieveCommand(
  buildRetrieveInput(config.knowledgeBaseId, question),
));

console.log(formatRetrievalResults(response.retrievalResults ?? []));
