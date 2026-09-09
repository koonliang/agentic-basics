import { createA2ATransport } from "./transport.js";

const target = process.env.COORDINATOR_AGENT_URL?.trim() || "http://127.0.0.1:19000";
const prompt = process.argv.slice(2).join(" ") || "Investigate cases/case-001.md using both specialists.";
const transport = createA2ATransport({
  region: process.env.AWS_REGION?.trim() || "ap-southeast-1",
  runtimeUserId: process.env.AGENT_RUNTIME_USER_ID?.trim() || "lab11-demo-user",
});
const coordinator = await transport.discover(target);

console.log(`Discovered ${coordinator.card.name}: ${coordinator.card.skills.map((skill) => skill.name).join(", ")}`);
console.log(await transport.send(coordinator, prompt));
