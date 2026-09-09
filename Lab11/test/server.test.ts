import assert from "node:assert/strict";
import test from "node:test";

import type { AddressInfo } from "node:net";

import { SendMessageRequest } from "@a2a-js/sdk";

import { createUserMessage } from "../src/a2a.js";
import type { Config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { createA2ATransport } from "../src/transport.js";

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

test("streams trace events and reports HealthyBusy while executing", async (context) => {
  let release: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const server = createApp(config, async (_prompt, _token, onTrace) => {
    onTrace?.({
      type: "tool_use",
      source: "order-investigator",
      message: "Read orders.json",
      timestamp: "2026-09-09T00:00:00.000Z",
      tool: "Read",
    });
    markStarted?.();
    await gate;
    return "verified order";
  }).listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const responsePromise = fetch(`${baseUrl}/`, {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "stream-1",
      method: "message/stream",
      params: {
        message: {
          kind: "message",
          messageId: "message-stream-1",
          role: "user",
          parts: [{ kind: "text", text: "case-001" }],
        },
      },
    }),
  });

  await started;
  assert.deepEqual(await (await fetch(`${baseUrl}/ping`)).json(), { status: "HealthyBusy" });
  release?.();
  const streamText = await (await responsePromise).text();
  assert.match(streamText, /Read orders.json/);
  assert.match(streamText, /verified order/);
  assert.deepEqual(await (await fetch(`${baseUrl}/ping`)).json(), { status: "Healthy" });
});

test("streams traces through the local A2A client", async (context) => {
  const server = createApp(config, async (_prompt, _token, onTrace) => {
    onTrace?.({
      type: "tool_use",
      source: "order-investigator",
      message: "Read orders.json",
      timestamp: "2026-09-09T00:00:00.000Z",
      tool: "Read",
    });
    return "verified order";
  }).listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const transport = createA2ATransport({
    region: "ap-southeast-1",
    runtimeUserId: "demo-user",
    fetchImpl: (input, init) => fetch(String(input).replace("127.0.0.1:9000", `127.0.0.1:${port}`), init),
  });
  const agent = await transport.discover(`http://127.0.0.1:${port}`);
  const messages: string[] = [];

  assert.equal(await transport.send(agent, "case-001", (trace) => messages.push(trace.message)), "verified order");
  assert.deepEqual(messages, ["Read orders.json"]);
});
