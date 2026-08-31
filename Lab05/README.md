# Lab05 — Build an HTTP MCP server

This lab exposes local order-support capabilities through the Model Context Protocol (MCP). It uses the current Streamable HTTP transport, so a client connects to a URL instead of launching the server as a child process over STDIO.

No Claude API key is needed. This lab builds and tests the MCP server only; Lab06 will connect the server to Claude.

## Learning objectives

By the end of this lab, you will be able to:

- distinguish MCP tools, resources, and prompts;
- create a stateless Streamable HTTP MCP endpoint;
- discover and invoke capabilities with an official MCP client;
- protect a local HTTP server with loopback binding and Host/Origin validation; and
- explain what must change before exposing an MCP server beyond a local machine.

## What the server exposes

| Primitive | Name or URI | Purpose |
| --- | --- | --- |
| Tool | `list_order_ids` | Lists the available order IDs |
| Tool | `get_order_status` | Returns one order record |
| Resource | `support://policies/refunds` | Provides the refund policy as Markdown |
| Prompt | `investigate_support_case` | Builds a reusable support-investigation prompt |

A **tool** performs an operation and returns a result. A **resource** exposes readable context identified by a URI. A **prompt** is a reusable message template that a client or user can choose to retrieve.

## Architecture

```text
MCP client
    |
    | Streamable HTTP requests
    v
http://127.0.0.1:3000/mcp
    |
    +-- tools -----> data/orders.json
    +-- resource --> data/refund-policy.md
    +-- prompt ----> generated support instructions
```

The HTTP layer creates a fresh MCP server for each request. This keeps the example stateless and avoids session storage. It also means the lab intentionally does not demonstrate resumable streams or server-to-client notifications tied to a long-lived session.

## Run the lab

Requirements: Node.js 22 or later and npm 10 or later. From the repository root:

```bash
cp .env.example .env
cd Lab05
npm ci
npm run server
```

The server prints:

```text
Order support MCP server listening at http://127.0.0.1:3000/mcp
```

It also logs each capability when an MCP client uses it:

```text
[mcp tool] list_order_ids {}
[mcp tool] get_order_status {"order_id":"A1001"}
[mcp resource] support://policies/refunds
[mcp prompt] investigate_support_case {"order_id":"A1002","issue":"The item arrived damaged"}
```

Tool logs appear in the Lab05 terminal while Lab06 is running, confirming that retrieval and execution happened in the MCP server process.

Use a different port if necessary:

```bash
PORT=3100 npm run server
```

You can set `PORT` in the root `.env`. When changing it, update the port in `MCP_SERVER_URL` so Lab06 connects to the same endpoint. Stop the server with `Ctrl+C`.

An MCP endpoint is not a normal web page. Use an MCP client to initialize a protocol connection, discover capabilities, and call them. The automated tests do exactly that:

```bash
npm test
npm run typecheck
```

The tests start the real HTTP server on an available loopback port and use the official MCP client and `StreamableHTTPClientTransport`. They do not call the tool implementation functions directly and do not make external network or model API calls.

## Read the implementation

Follow the request path in this order:

1. `src/index.ts` starts and stops the HTTP server.
2. `src/http-server.ts` owns the `/mcp` route, transport handler, and HTTP guards.
3. `src/mcp.ts` registers the tools, resource, and prompt.
4. `src/orders.ts` reads and queries the local order data.
5. `test/mcp-http.test.ts` acts as a real MCP client.

Notice the separation: MCP describes and transports capabilities, while ordinary application functions still implement the business logic.

## Why HTTP instead of STDIO?

STDIO is convenient when one local client starts and owns one server process. Streamable HTTP gives the server a reusable network endpoint, which is closer to how multiple applications or remotely deployed clients connect.

HTTP adds concerns that STDIO largely avoids:

- port allocation and server lifecycle;
- authentication and authorization for non-local deployments;
- TLS when traffic leaves the local machine;
- Origin and Host validation, including DNS-rebinding protection;
- session storage and horizontal scaling if stateful sessions are introduced; and
- timeouts, proxies, rate limits, and operational monitoring.

This lab binds only to `127.0.0.1`, has no authentication, and accepts only local Host and Origin values. That is appropriate for learning on one machine, but it is not a production deployment configuration.

## Handoff to Lab06

Keep this server running in one terminal. Lab06 will connect from another process using:

```env
MCP_SERVER_URL=http://127.0.0.1:3000/mcp
```

That client will discover the server's schemas dynamically and bridge the MCP tools to Claude. Lab05 itself does not call the Anthropic Messages API or the Claude Agent SDK.

## References

- [MCP TypeScript SDK: HTTP server transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)
- [MCP TypeScript SDK: client usage](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [MCP architecture and concepts](https://modelcontextprotocol.io/docs/learn/architecture)
