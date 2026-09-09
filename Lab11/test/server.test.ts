import assert from "node:assert/strict";
import test from "node:test";

import type { AddressInfo } from "node:net";

import { SendMessageRequest } from "@a2a-js/sdk";

import { createUserMessage } from "../src/a2a.js";
import type { Config } from "../src/config.js";
import { createApp } from "../src/server.js";

const config: Config = {
  baseUrl: "https://gateway.example",
  credentialProviderName: "provider",
  model: "model",
  port: 9000,
  publicUrl: "http://127.0.0.1:9000/",
  region: "ap-southeast-1",
  role: "order-investigator",
  runtimeUserId: "demo-user",
  workspace: "workspace",
};

test("serves ping, Agent Card, and AgentCore-compatible A2A messages", async (context) => {
  const server = createApp(config, async (prompt) => `checked: ${prompt}`).listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const ping = await fetch(`${baseUrl}/ping`);
  assert.deepEqual(await ping.json(), { status: "Healthy" });

  const card = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
    headers: { "A2A-Version": "1.0" },
  });
  assert.equal((await card.json() as { name: string }).name, "Order Investigator");

  const response = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "request-1",
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "message-1",
          role: "user",
          parts: [{ kind: "text", text: "case-001" }],
        },
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.match(JSON.stringify(await response.json()), /checked: case-001/);

  const v1Response = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: { "A2A-Version": "1.0", "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "request-2",
      method: "SendMessage",
      params: SendMessageRequest.toJSON({
        tenant: "",
        message: createUserMessage("case-002"),
        configuration: undefined,
        metadata: undefined,
      }),
    }),
  });
  assert.equal(v1Response.status, 200);
  assert.match(JSON.stringify(await v1Response.json()), /checked: case-002/);
});
