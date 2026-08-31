import { readFile } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getOrderStatus, listOrderIds } from "./orders.js";

const refundPolicyFile = new URL("../data/refund-policy.md", import.meta.url);

export function createOrderMcpServer(): McpServer {
  const server = new McpServer({ name: "order-support", version: "1.0.0" });

  server.registerTool(
    "list_order_ids",
    {
      title: "List Order IDs",
      description: "List the IDs of all orders available to the support agent.",
      inputSchema: z.object({}),
    },
    async () => {
      console.log("[mcp tool] list_order_ids {}");
      const output = { order_ids: await listOrderIds() };
      return { content: [{ type: "text", text: JSON.stringify(output) }] };
    },
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get Order Status",
      description: "Get the current record for one order ID.",
      inputSchema: z.object({
        order_id: z.string().describe("Order ID such as A1001"),
      }),
    },
    async ({ order_id }) => {
      console.log(`[mcp tool] get_order_status ${JSON.stringify({ order_id })}`);
      const order = await getOrderStatus(order_id);
      if (!order) {
        return {
          isError: true,
          content: [{ type: "text", text: `Order ${order_id.trim().toUpperCase()} was not found.` }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(order) }] };
    },
  );

  server.registerResource(
    "refund-policy",
    "support://policies/refunds",
    {
      title: "Refund Policy",
      description: "Rules for refunds, delivery investigations, and cancellations.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      console.log(`[mcp resource] ${uri.href}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: await readFile(refundPolicyFile, "utf8"),
        }],
      };
    },
  );

  server.registerPrompt(
    "investigate_support_case",
    {
      title: "Investigate Support Case",
      description: "Create an investigation prompt using an order ID and customer issue.",
      argsSchema: z.object({
        order_id: z.string().describe("Order ID to investigate"),
        issue: z.string().describe("Customer's reported issue"),
      }),
    },
    ({ order_id, issue }) => {
      console.log(`[mcp prompt] investigate_support_case ${JSON.stringify({ order_id, issue })}`);
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: [
              `Investigate order ${order_id}.`,
              `Customer issue: ${issue}`,
              "Use the order tools and refund-policy resource.",
              "Explain the evidence and recommend the next support action.",
            ].join("\n"),
          },
        }],
      };
    },
  );

  return server;
}
