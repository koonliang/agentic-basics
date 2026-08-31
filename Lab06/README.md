# Lab06 — Connect MCP tools to Claude

Lab05 exposed order-support capabilities from a Streamable HTTP MCP server. Lab06 is a separate client that discovers those capabilities and makes the MCP tools available to Claude.

This lab uses the Anthropic Messages API and implements the agent loop directly. It does not use the Claude Agent SDK. Keeping the loop visible makes the MCP-to-Claude bridge easier to understand.

## Learning objectives

By the end of this lab, you will be able to:

- connect an official MCP client to a Streamable HTTP server;
- discover tool schemas without copying them into the client;
- convert MCP tool definitions into Claude tool definitions;
- route Claude's tool requests back through MCP;
- return MCP successes and failures as Claude `tool_result` blocks; and
- inspect MCP resources and prompts as primitives distinct from tools.

## Architecture

```text
User prompt
    |
    v
Lab06 agent loop ----------------> Anthropic Messages API
    |                                      |
    | discover tool schemas                | tool_use
    | call requested tool                  v
    +---- Streamable HTTP -----> Lab05 MCP server
                                      |
                                      +-- orders.json
                                      +-- refund-policy.md
```

Lab06 does not import any source code from Lab05 and does not know how its tools are implemented. Their only contract is MCP over `MCP_SERVER_URL`.

## Setup

Requirements: Node.js 22 or later, an Anthropic-compatible API key, and the Lab05 server.

Install both self-contained labs:

```bash
cd Lab05
npm ci

cd ../Lab06
npm ci
cp .env.example .env
```

Edit `Lab06/.env`:

```dotenv
ANTHROPIC_API_KEY=your-key
CLAUDE_MODEL=claude-haiku-4-5
ANTHROPIC_BASE_URL=https://api.anthropic.com
MCP_SERVER_URL=http://127.0.0.1:3000/mcp
```

For a custom Anthropic gateway, set `ANTHROPIC_BASE_URL` to its Anthropic-compatible base URL. The gateway must support Messages API client-tool calls and `tool_result` blocks. This lab does not use Anthropic server tools such as web search.

## Run the demo

Start Lab05 in the first terminal:

```bash
cd Lab05
npm run server
```

Run Lab06 in a second terminal:

```bash
cd Lab06
npm run demo -- "How many orders do I have? Give me the details of every order."
```

A typical trace looks like this:

```text
[mcp] discovered tools: list_order_ids, get_order_status
[model] turn=1 stop_reason=tool_use
[mcp call] list_order_ids {}
[mcp result] list_order_ids error=false {"order_ids":["A1001","A1002","A1003"]}
[model] turn=2 stop_reason=tool_use
[mcp call] get_order_status {"order_id":"A1001"}
...
[model] turn=3 stop_reason=end_turn

[assistant]
...
```

Claude decides which discovered tools to call and may call several tools in one turn. The application executes calls from the same turn in parallel.

At the same time, the Lab05 terminal shows the server-side executions:

```text
[mcp tool] list_order_ids {}
[mcp tool] get_order_status {"order_id":"A1001"}
```

The Lab06 trace shows the client side of the protocol, while these Lab05 logs confirm that the calls reached and ran in the separate MCP server process.

## Inspect all MCP primitives

These commands connect to Lab05 but do not call Claude or consume model credits.

Discover tools, resources, and prompts:

```bash
npm run inspect
```

Read the refund-policy resource:

```bash
npm run resource -- support://policies/refunds
```

Retrieve the reusable support prompt:

```bash
npm run prompt -- investigate_support_case order_id=A1002 "issue=The item arrived damaged"
```

Tools, resources, and prompts have different semantics:

| MCP primitive | How Lab06 uses it |
| --- | --- |
| Tool | Converted to a Claude tool and callable by the agent |
| Resource | Read explicitly by URI with the MCP client |
| Prompt | Retrieved explicitly by name and arguments |

Resources and prompts are not silently converted into tools or injected into Claude's context. An application must choose when to read a resource or retrieve a prompt and then decide how to use its contents.

## Follow one tool call

The bridge performs these steps:

1. `McpConnection.listTools()` asks Lab05 for its current tool definitions.
2. `toClaudeTools()` maps each MCP `inputSchema` to Claude's `input_schema`. It removes the root `$schema` dialect annotation because Claude accepts a JSON Schema subset rather than selecting a dialect from that annotation.
3. The application sends those definitions with the user message to Claude.
4. Claude returns a `tool_use` block containing a discovered name and input.
5. `McpConnection.callTool()` sends that call to Lab05 over HTTP.
6. The application converts the MCP result into a Claude `tool_result` block.
7. Claude uses the result in its next turn and eventually returns text.

There is deliberately no order-specific dispatch code in Lab06. Adding another compatible tool to Lab05 makes its schema discoverable without adding a new handler to this client.

## Verify offline

```bash
npm test
npm run typecheck
```

The tests use fake model and MCP clients, so they require neither server nor API access. They verify schema conversion, multi-turn execution, parallel tool calls, error propagation, and configuration validation. Lab05 has separate protocol-level integration tests for the HTTP server.

## Source map

- `src/mcp-client.ts`: official MCP client, Streamable HTTP transport, and result conversion
- `src/agent.ts`: schema bridge and manual Claude tool loop
- `src/claude-client.ts`: Anthropic Messages API adapter
- `src/mcp-cli.ts`: resource, prompt, and discovery commands
- `src/index.ts`: demo configuration, connection lifecycle, and trace output
- `test/`: offline bridge tests

## Local HTTP limitations

Lab05 is bound to `127.0.0.1` and intentionally has no authentication. Keep it local. A remote deployment needs HTTPS, authentication and authorization, suitable Origin/Host policy, secrets handling, timeouts, and operational controls. The simple Lab06 client also does not attach authentication headers.

## Experiments

1. Ask about one known order and observe whether Claude skips `list_order_ids`.
2. Ask for every order and observe multiple `get_order_status` calls in one turn.
3. Ask for `A9999` and inspect how the MCP tool error reaches Claude.
4. Add a tool to Lab05, restart it, then run `npm run inspect` in Lab06.
5. Retrieve the investigation prompt and use its returned text as the demo prompt.

## References

- [MCP TypeScript SDK: client usage](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [MCP architecture and concepts](https://modelcontextprotocol.io/docs/learn/architecture)
- [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
