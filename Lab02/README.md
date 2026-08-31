# Lab02: Client Tools and Server Tools

Lab01 introduced the basic tool loop. Lab02 compares two places where a tool can execute:

- A **client tool** is selected by Claude but executed by your Node.js application.
- A **server tool** is selected and executed on Anthropic's infrastructure.

Both demos use the Anthropic TypeScript SDK to call the Messages API directly. They do not use the Claude Agent SDK.

## What you will learn

- How tool types differ by execution location and ownership
- How `strict`, `tool_choice`, parallel calls, and `is_error` affect client tools
- Why client tools require a tool loop but server tools usually do not
- How to continue the occasional `pause_turn` returned by a server tool

## Tool taxonomy

| Type | Defined by | Executed by | Example |
|---|---|---|---|
| User-defined client tool | Your application | Your application | `count_orders` |
| Anthropic-defined client tool | Anthropic | Your application | Computer-use tool |
| Anthropic server tool | Anthropic | Anthropic | Web search |
| Agent SDK built-in tool | Agent SDK | Agent runtime | Read or Bash |
| MCP tool | MCP server | MCP server | A future lab |

A hook is not a tool. A hook observes or intercepts lifecycle events such as a tool call; hooks will be covered in a later lab.

## Setup

Requirements: Node.js 22 or later and an Anthropic API key.

```bash
cd Lab02
cp .env.example .env
npm install
```

Edit `.env`:

```dotenv
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-haiku-4-5
```

For a custom gateway, replace `ANTHROPIC_BASE_URL` with its Anthropic-compatible base URL. The client-tool demo only needs Messages API tool-use support. The server-tool demo also requires the gateway to support Anthropic's server-side web search tool.

## Demo 1: client tools

Ask Claude to choose and call `count_orders`:

```bash
npm run client -- --choice=auto "How many orders do I have?"
```

Ask for every order's details without providing IDs:

```bash
npm run client -- --choice=auto "How many orders do I have, and what are the details of each order?"
```

Claude can first call `list_order_ids`, then call `get_order_status` once for each discovered ID. Those independent status calls can be returned together and executed in parallel. The tool descriptions distinguish a count-only request from a request that needs order discovery.

Compare two orders. Claude may return both tool calls in one response, and Node.js executes them with `Promise.all`:

```bash
npm run client -- --choice=auto "Compare orders A1001 and A1002"
```

Try the three first-turn tool-choice modes:

```bash
npm run client -- --choice=auto "How many orders do I have?"
npm run client -- --choice=any "How many orders do I have?"
npm run client -- --choice=none "How many orders do I have?"
```

| Choice | Meaning |
|---|---|
| `auto` | Claude decides whether to call a tool |
| `any` | Claude must call one of the supplied tools |
| `none` | Claude cannot call a tool |

After a forced `any` call, the demo changes back to `auto` so Claude can produce a final answer.

To tell Claude to emit at most one tool call per response and execute calls sequentially:

```bash
npm run client -- --sequential "Compare orders A1001 and A1002"
```

Try an error result:

```bash
npm run client -- "Where is order A9999?"
```

The application returns `is_error: true`; Claude can then explain the failure to the user. Both client tools use `strict: true` and JSON Schemas with `additionalProperties: false`, so their generated inputs must match the schemas.

### Client-tool sequence

```text
User -> Claude: question + tool definitions
Claude -> Node.js: list_order_ids tool_use
Node.js -> Claude: discovered IDs
Claude -> Node.js: multiple get_order_status tool_use blocks
Node.js -> local functions: execute lookups in parallel
Node.js -> Claude: all tool_result blocks in one message
Claude -> User: final answer
```

## Demo 2: Anthropic server tool

Run a current web search:

```bash
npm run server -- "Search for current delivery disruptions in Singapore"
```

The response may contain `server_tool_use`, `web_search_tool_result`, and `text` blocks. Your application displays these events but does not execute the search or send a `tool_result` back. If Anthropic returns `pause_turn`, it appends that assistant response and asks the API to continue.

```text
User -> Claude: question + server tool definition
Claude/Anthropic server: execute web search
Claude -> User: search result + final answer
```

Server-side web search has separate usage charges and may not be available through every custom gateway.

## Verify offline

The tests use a fake model client and make no network requests:

```bash
npm test
npm run typecheck
```

## Source map

- `src/client-agent.ts`: client tool definitions, discovery, dispatch, parallel execution, and loop
- `src/server-agent.ts`: server web-search definition and `pause_turn` handling
- `src/claude-client.ts`: thin adapter around the Anthropic SDK
- `data/orders.json`: local data read by the client tools

## References

- [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference)
- [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use)
- [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
- [Web search server tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
