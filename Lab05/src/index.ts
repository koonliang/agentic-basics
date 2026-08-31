import { parsePort, startHttpServer } from "./http-server.js";

const server = await startHttpServer(parsePort(process.env.PORT));
console.log(`Order support MCP server listening at ${server.url.href}`);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await server.close();
  console.log("MCP server stopped.");
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
