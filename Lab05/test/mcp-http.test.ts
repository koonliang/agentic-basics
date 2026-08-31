import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, test } from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { parsePort, startHttpServer, type RunningServer } from "../src/http-server.js";

let running: RunningServer;
let client: Client;

before(async () => {
  running = await startHttpServer(0);
  client = new Client({ name: "lab05-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(running.url));
});

after(async () => {
  await client.close();
  await running.close();
});

test("discovers the order tools through MCP", async () => {
  const result = await client.listTools();
  assert.deepEqual(
    result.tools.map((tool) => tool.name).sort(),
    ["get_order_status", "list_order_ids"],
  );
});

test("calls list_order_ids through MCP", async () => {
  const result = await client.callTool({ name: "list_order_ids", arguments: {} });
  assert.deepEqual(JSON.parse(textContent(result.content)), {
    order_ids: ["A1001", "A1002", "A1003"],
  });
});

test("calls get_order_status through MCP", async () => {
  const result = await client.callTool({
    name: "get_order_status",
    arguments: { order_id: "a1002" },
  });
  const order = JSON.parse(textContent(result.content)) as { id: string; status: string };
  assert.equal(order.id, "A1002");
  assert.equal(order.status, "delivered");
});

test("returns a tool error for an unknown order", async () => {
  const result = await client.callTool({
    name: "get_order_status",
    arguments: { order_id: "A9999" },
  });
  assert.equal(result.isError, true);
  assert.match(textContent(result.content), /was not found/);
});

test("discovers and reads the refund-policy resource", async () => {
  const listed = await client.listResources();
  assert.deepEqual(listed.resources.map((resource) => resource.uri), ["support://policies/refunds"]);

  const result = await client.readResource({ uri: "support://policies/refunds" });
  assert.equal(result.contents[0]?.mimeType, "text/markdown");
  assert.match(resourceText(result.contents[0]), /delivered order that arrived damaged/);
});

test("discovers and retrieves the reusable prompt", async () => {
  const listed = await client.listPrompts();
  assert.deepEqual(listed.prompts.map((prompt) => prompt.name), ["investigate_support_case"]);

  const result = await client.getPrompt({
    name: "investigate_support_case",
    arguments: { order_id: "A1002", issue: "The item arrived damaged" },
  });
  const content = result.messages[0]?.content;
  assert.equal(content?.type, "text");
  if (content?.type !== "text") throw new Error("Expected text prompt content.");
  assert.match(content.text, /A1002/);
  assert.match(content.text, /arrived damaged/);
});

test("rejects a non-local Host header", async () => {
  assert.equal(await statusFor(running.url, { Host: "evil.example" }), 403);
});

test("rejects a non-local Origin header", async () => {
  assert.equal(await statusFor(running.url, { Origin: "https://evil.example" }), 403);
});

test("validates configured ports", () => {
  assert.equal(parsePort(undefined), 3000);
  assert.equal(parsePort("4000"), 4000);
  assert.throws(() => parsePort("invalid"), /PORT must be an integer/);
  assert.throws(() => parsePort("70000"), /PORT must be an integer/);
});

function textContent(content: unknown): string {
  if (!Array.isArray(content)) throw new Error("Expected MCP content blocks.");
  const block = content.find(
    (value): value is { type: "text"; text: string } =>
      typeof value === "object" &&
      value !== null &&
      (value as { type?: unknown }).type === "text" &&
      typeof (value as { text?: unknown }).text === "string",
  );
  if (!block) throw new Error("Expected an MCP text content block.");
  return block.text;
}

function resourceText(content: unknown): string {
  if (typeof content !== "object" || content === null) throw new Error("Expected resource content.");
  const text = (content as { text?: unknown }).text;
  if (typeof text !== "string") throw new Error("Expected text resource content.");
  return text;
}

function statusFor(url: URL, headers: Record<string, string>): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    req.once("error", reject);
    req.end("{}");
  });
}
