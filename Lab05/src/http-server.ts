import { createServer, type Server as HttpServer } from "node:http";

import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { createOrderMcpServer } from "./mcp.js";

const host = "127.0.0.1";

export interface RunningServer {
  url: URL;
  close(): Promise<void>;
}

export async function startHttpServer(port: number): Promise<RunningServer> {
  const handler = createMcpHandler(createOrderMcpServer);
  const handleMcp = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
      if (path !== "/mcp") {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      if (!validateHost(request, response) || !validateOrigin(request, response)) return;
      await handleMcp(
        request as unknown as Parameters<typeof handleMcp>[0],
        response,
      );
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain" });
      if (!response.writableEnded) response.end("Internal server error");
    }
  });

  await listen(server, port);
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Could not determine the MCP server address.");
  }

  return {
    url: new URL(`http://${host}:${address.port}/mcp`),
    close: async () => {
      await handler.close();
      await closeServer(server);
    },
  };
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }
  return port;
}

function listen(server: HttpServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
