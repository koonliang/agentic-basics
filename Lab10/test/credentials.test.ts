import assert from "node:assert/strict";
import test from "node:test";

import { resolveGatewayApiKey } from "../src/credentials.js";

test("uses the local API key outside AgentCore Runtime", async () => {
  assert.equal(await resolveGatewayApiKey({
    localApiKey: "local-key",
    providerName: "gateway",
  }), "local-key");
});

test("uses AgentCore Identity when a workload token is present", async () => {
  let received: unknown;

  const result = await resolveGatewayApiKey({
    identityResolver: async (providerName, workloadAccessToken) => {
      received = { providerName, workloadAccessToken };
      return "identity-key";
    },
    localApiKey: "local-key",
    providerName: "gateway",
    workloadAccessToken: "workload-token",
  });

  assert.equal(result, "identity-key");
  assert.deepEqual(received, {
    providerName: "gateway",
    workloadAccessToken: "workload-token",
  });
});

test("fails when neither credential source is available", async () => {
  await assert.rejects(
    resolveGatewayApiKey({ providerName: "gateway" }),
    /No gateway credential is available/,
  );
});
