import type { Server } from "node:http";

import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore, STATE_HEADERS_KEY, type AgentExecutor, type RequestHeaders } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import express, { type Express } from "express";

import { createAgentCard, createAgentMessage, textFromMessage } from "./a2a.js";
import { coordinate, createClaudeCoordinatorModel, type GatewayCredential } from "./coordinator.js";
import type { Config } from "./config.js";
import { resolveGatewayApiKey } from "./credentials.js";
import { runSpecialist } from "./specialist.js";
import { createA2ATransport } from "./transport.js";

export type RoleRunner = (
  prompt: string,
  workloadAccessToken: string | undefined,
) => Promise<string>;

export function createRoleRunner(config: Config): RoleRunner {
  const transport = createA2ATransport({
    region: config.region,
    runtimeUserId: config.runtimeUserId,
  });

  return async (prompt, workloadAccessToken) => {
    const apiKey = await resolveGatewayApiKey({
      providerName: config.credentialProviderName,
      ...(config.localApiKey ? { localApiKey: config.localApiKey } : {}),
      ...(workloadAccessToken ? { workloadAccessToken } : {}),
    });
    const gateway: GatewayCredential = { apiKey, baseUrl: config.baseUrl };

    if (config.role === "coordinator") {
      if (!config.orderAgentTarget || !config.policyAgentTarget) {
        throw new Error("Coordinator specialist targets are missing.");
      }
      return coordinate({
        model: createClaudeCoordinatorModel(config.model, gateway),
        prompt,
        targets: [
          { id: "order-investigator", target: config.orderAgentTarget },
          { id: "policy-specialist", target: config.policyAgentTarget },
        ],
        transport,
      });
    }

    return runSpecialist(config.role, prompt, config.workspace, config.model, gateway);
  };
}

export function createApp(config: Config, runRole: RoleRunner = createRoleRunner(config)): Express {
  const card = createAgentCard(config.role, config.publicUrl);
  const executor: AgentExecutor = {
    async execute(requestContext, eventBus) {
      const prompt = textFromMessage(requestContext.userMessage);
      if (!prompt) throw new Error("A2A message must contain a non-empty text part.");
      const result = await runRole(prompt, workloadToken(requestContext.context.state.get(STATE_HEADERS_KEY)));
      eventBus.publish(AgentEvent.message(createAgentMessage(result, requestContext.contextId)));
      eventBus.finished();
    },
    async cancelTask() {
      throw new Error("Task cancellation is not supported in this lab.");
    },
  };
  const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);
  const app = express();

  app.get("/ping", (_request, response) => response.json({ status: "Healthy" }));
  app.use("/.well-known/agent-card.json", agentCardHandler({
    agentCardProvider: handler,
    legacyCompat: { enabled: true },
  }));
  app.use("/", jsonRpcHandler({
    requestHandler: handler,
    userBuilder: UserBuilder.noAuthentication,
    legacyCompat: { enabled: true },
  }));
  return app;
}

export function startServer(config: Config, app: Express = createApp(config)): Server {
  return app.listen(config.port, "0.0.0.0", () => {
    console.log(`${config.role} listening on http://0.0.0.0:${config.port}`);
  });
}

function workloadToken(value: unknown): string | undefined {
  if (!isHeaders(value)) return undefined;
  const header = Object.entries(value).find(([name]) =>
    name.toLowerCase().replaceAll("-", "") === "workloadaccesstoken"
  )?.[1];
  if (Array.isArray(header)) return header[0];
  return header;
}

function isHeaders(value: unknown): value is RequestHeaders {
  return typeof value === "object" && value !== null;
}
