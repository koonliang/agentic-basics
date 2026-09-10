import { fileURLToPath } from "node:url";

import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

import { collectSessionSpans, evaluateCase, loadEvaluationCases } from "./evaluation.js";
import { createA2ATransport } from "./transport.js";

const region = process.env.AWS_REGION?.trim() || "ap-southeast-1";
const runtimeArn = required(process.env.AGENT_RUNTIME_ARN, "AGENT_RUNTIME_ARN");
const runtimeId = runtimeArn.split("/").at(-1);
if (!runtimeId) throw new Error("AGENT_RUNTIME_ARN does not contain a runtime ID.");
const logGroupName = process.env.AGENT_LOG_GROUP?.trim()
  || `/aws/bedrock-agentcore/runtimes/${runtimeId}-DEFAULT`;
const fixturePath = fileURLToPath(new URL("../evaluations/cases.json", import.meta.url));
const requestedId = process.argv[2];
const fixtures = (await loadEvaluationCases(fixturePath)).filter(({ id }) => !requestedId || id === requestedId);
if (fixtures.length === 0) throw new Error(`Unknown evaluation case: ${requestedId}`);

const agentCore = new BedrockAgentCoreClient({ region });
const logs = new CloudWatchLogsClient({ region });
const transport = createA2ATransport({
  agentCoreClient: agentCore,
  region,
  runtimeUserId: process.env.AGENT_RUNTIME_USER_ID?.trim() || "lab12-evaluation-user",
});

for (const fixture of fixtures) {
  const coordinator = await transport.discover(runtimeArn);
  const started = Date.now() - 5_000;
  console.log(`\n${fixture.id} (session ${coordinator.sessionId})`);
  const answer = await transport.send(coordinator, fixture.prompt);
  console.log(`Answer: ${answer}`);
  const spans = await collectSessionSpans(logs, logGroupName, coordinator.sessionId, started, {
    onProgress: (message) => console.log(message),
  });
  const results = await evaluateCase(agentCore, fixture, coordinator.sessionId, spans);
  for (const result of results) {
    const score = result.value === undefined ? "n/a" : result.value.toString();
    console.log(`${result.evaluatorId}: score=${score}, label=${result.label ?? "n/a"}`);
    if (result.explanation) console.log(`  ${result.explanation}`);
    if (result.errorMessage) console.log(`  evaluator error: ${result.errorMessage}`);
  }
}

function required(value: string | undefined, name: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
}
