import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import type { McpTool, McpToolClient, McpToolResult } from "./types.js";

export class McpConnection implements McpToolClient {
  private readonly client = new Client({ name: "lab06-client", version: "1.0.0" });

  private constructor() {}

  static async connect(url: URL): Promise<McpConnection> {
    const connection = new McpConnection();
    await connection.client.connect(new StreamableHTTPClientTransport(url));
    return connection;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, input: unknown): Promise<McpToolResult> {
    const args = isRecord(input) ? input : {};
    const result = await this.client.callTool({ name, arguments: args });
    return {
      output: contentToText(result.content),
      isError: result.isError === true,
    };
  }

  async inspect(): Promise<unknown> {
    const [tools, resources, prompts] = await Promise.all([
      this.client.listTools(),
      this.client.listResources(),
      this.client.listPrompts(),
    ]);
    return { tools: tools.tools, resources: resources.resources, prompts: prompts.prompts };
  }

  async readResource(uri: string): Promise<unknown> {
    return this.client.readResource({ uri });
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<unknown> {
    return this.client.getPrompt({ name, arguments: args });
  }
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content.map((block) => {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
    return JSON.stringify(block);
  }).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
