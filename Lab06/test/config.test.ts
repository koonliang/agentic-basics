import assert from "node:assert/strict";
import { test } from "node:test";

import { mcpServerUrl } from "../src/config.js";

test("accepts HTTP MCP URLs", () => {
  assert.equal(mcpServerUrl("http://127.0.0.1:3000/mcp").href, "http://127.0.0.1:3000/mcp");
  assert.equal(mcpServerUrl("https://mcp.example.com/api").protocol, "https:");
});

test("rejects missing and unsupported MCP URLs", () => {
  assert.throws(() => mcpServerUrl(undefined), /MCP_SERVER_URL is missing/);
  assert.throws(() => mcpServerUrl("file:///tmp/server"), /must use http or https/);
});
