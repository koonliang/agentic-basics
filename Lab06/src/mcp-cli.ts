import { mcpServerUrl } from "./config.js";
import { McpConnection } from "./mcp-client.js";

const [command, target, ...rawArgs] = process.argv.slice(2);

try {
  const connection = await McpConnection.connect(mcpServerUrl(process.env.MCP_SERVER_URL));
  try {
    if (command === "inspect") {
      console.log(JSON.stringify(await connection.inspect(), null, 2));
    } else if (command === "resource" && target) {
      console.log(JSON.stringify(await connection.readResource(target), null, 2));
    } else if (command === "prompt" && target) {
      console.log(JSON.stringify(await connection.getPrompt(target, parseArgs(rawArgs)), null, 2));
    } else {
      throw new Error("Use inspect, resource <uri>, or prompt <name> key=value ...");
    }
  } finally {
    await connection.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function parseArgs(values: string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf("=");
    if (separator < 1) throw new Error(`Prompt argument must use key=value: ${value}`);
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
}
