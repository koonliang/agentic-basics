import { randomUUID } from "node:crypto";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

import { createInvocationInput } from "./remote.js";

const agentRuntimeArn = process.env.AGENT_RUNTIME_ARN?.trim();
if (!agentRuntimeArn) throw new Error("AGENT_RUNTIME_ARN is required.");

const region = process.env.AWS_REGION?.trim() || "ap-southeast-1";
const userId = process.env.AGENT_RUNTIME_USER_ID?.trim() || "lab10-demo-user";
const prompt = process.argv.slice(2).join(" ") || "Investigate cases/case-001.md using both specialists.";
const client = new BedrockAgentCoreClient({ region });
const response = await client.send(new InvokeAgentRuntimeCommand(createInvocationInput({
  agentRuntimeArn,
  prompt,
  sessionId: randomUUID(),
  userId,
})));

if (!response.response) throw new Error("AgentCore Runtime returned no response body.");
for await (const chunk of response.response as AsyncIterable<Uint8Array>) {
  process.stdout.write(Buffer.from(chunk));
}
