import { createA2ATransport } from "./transport.js";
import { formatTrace } from "./trace.js";

const target = process.env.AGENT_RUNTIME_ARN?.trim();
if (!target) throw new Error("AGENT_RUNTIME_ARN is required.");

const prompt = process.argv.slice(2).join(" ") || "Investigate cases/case-001.md using both specialists.";
const transport = createA2ATransport({
  region: process.env.AWS_REGION?.trim() || "ap-southeast-1",
  runtimeUserId: process.env.AGENT_RUNTIME_USER_ID?.trim() || "lab11-demo-user",
});
const coordinator = await transport.discover(target);

console.log(`Discovered ${coordinator.card.name}: ${coordinator.card.skills.map((skill) => skill.name).join(", ")}`);
const answer = await transport.send(coordinator, prompt, (trace) => console.log(formatTrace(trace)));
console.log(`\n${answer}`);
