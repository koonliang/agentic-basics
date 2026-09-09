import assert from "node:assert/strict";
import test from "node:test";

import { resolveGatewayApiKey } from "../src/credentials.js";

test("uses local credentials when no workload token is present", async () => {
  assert.equal(await resolveGatewayApiKey({
    localApiKey: "local-key",
    providerName: "gateway",
  }), "local-key");
});

test("prefers AgentCore Identity for workload requests", async () => {
  const value = await resolveGatewayApiKey({
    identityResolver: async (provider, token) => `${provider}:${token}`,
    localApiKey: "local-key",
    providerName: "gateway",
    workloadAccessToken: "wat",
  });
  assert.equal(value, "gateway:wat");
});

test("rejects requests without a local key or workload token", async () => {
  await assert.rejects(resolveGatewayApiKey({ providerName: "gateway" }), /No gateway credential/);
});
