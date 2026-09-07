import { randomUUID } from "node:crypto";

const prompt = process.argv.slice(2).join(" ") || "Investigate cases/case-001.md using both specialists.";
const port = process.env.LAB10_PORT?.trim() || "8080";
const response = await fetch(`http://127.0.0.1:${port}/invocations`, {
  method: "POST",
  headers: {
    accept: "text/event-stream",
    "content-type": "application/json",
    "x-amzn-bedrock-agentcore-runtime-session-id": randomUUID(),
  },
  body: JSON.stringify({ prompt }),
});

if (!response.ok) throw new Error(`Runtime returned HTTP ${response.status}: ${await response.text()}`);
if (!response.body) throw new Error("Runtime returned no response body.");

const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(value);
}
