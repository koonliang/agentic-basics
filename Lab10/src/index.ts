import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";
import { z } from "zod";

import { runCoordinator } from "./agent.js";
import { loadConfig } from "./config.js";
import { resolveGatewayApiKey } from "./credentials.js";
import { processInvocation } from "./runtime.js";

const config = loadConfig();
const requestSchema = z.object({ prompt: z.string().trim().min(1) });

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    process: async function* (request, context) {
      const apiKey = await resolveGatewayApiKey({
        providerName: config.credentialProviderName,
        ...(config.localApiKey ? { localApiKey: config.localApiKey } : {}),
        ...(context.workloadAccessToken
          ? { workloadAccessToken: context.workloadAccessToken }
          : {}),
      });

      yield* processInvocation(
        request,
        (prompt) => runCoordinator(prompt, config.workspace, config.model, {
          apiKey,
          baseUrl: config.baseUrl,
        }),
      );
    },
  },
});

app.run({ port: config.port });
