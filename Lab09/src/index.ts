import { BedrockAgentCoreApp } from "bedrock-agentcore/runtime";
import { z } from "zod";

import { runCoordinator } from "./agent.js";
import { loadConfig } from "./config.js";
import { processInvocation } from "./runtime.js";

const config = loadConfig();
const requestSchema = z.object({ prompt: z.string().trim().min(1) });

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    process: async function* (request) {
      yield* processInvocation(
        request,
        (prompt) => runCoordinator(prompt, config.workspace, config.model),
      );
    },
  },
});

app.run({ port: config.port });
