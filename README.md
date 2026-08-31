# Agentic AI Basics

Hands-on labs for learning how LLM agents decide what to do, call tools, handle results, and coordinate work. The examples use Node.js, TypeScript, and Claude.

Each lab is self-contained: enter its directory, install its dependencies, and follow its README. Labs do not import code from one another.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- An Anthropic API key with API billing enabled for labs that call Claude

A Claude subscription and Anthropic API usage are billed separately. Keep API keys in a local `.env` file and never commit them.

## Learning path

| Lab | Topic | Status |
| --- | --- | --- |
| [Lab01](./Lab01/README.md) | Build a manual agent loop that calls a custom tool | Implemented |
| [Lab02](./Lab02/README.md) | Compare client and server tools; classify other tool types | Implemented |
| [Lab03](./Lab03/README.md) | Build a read-only agent with the Claude Agent SDK | Implemented |
| [Lab04](./Lab04/README.md) | Add hooks, permissions, and human approval | Implemented |
| Lab05 | Build a local STDIO MCP server | Planned |
| Lab06 | Build an MCP client and bridge its tools to Claude | Planned |
| Lab07 | Coordinate specialist subagents | Planned |
| Lab08 | Evaluate agent tool choices with Message Batches | Planned |

## Tool taxonomy

Tools differ mainly by who defines them and where they execute.

| Tool type | Defined by | Executed by | Example |
| --- | --- | --- | --- |
| User-defined client tool | Your application | Your application | Looking up an order in a database |
| Anthropic-defined client tool | Anthropic | Your application | Bash or text editor |
| Server tool | Anthropic | Anthropic | Web search or code execution |
| Agent SDK built-in tool | Claude Agent SDK | Local agent runtime | Read, Grep, or Write |
| MCP tool | An MCP server | The MCP server | Searching Jira or reading internal data |

Hooks are not tools. Hooks observe or control agent lifecycle events such as a tool being requested, completed, or denied.

## Curriculum plan

### Lab01 — First tool-using agent

Implement the Claude Messages API loop manually. Claude requests `get_order_status`, the Node.js application executes it against local JSON, and the result is returned to Claude. The loop ends when Claude produces its final answer or reaches a safety limit.

### Lab02 — Types of tools and tool control

Compare a user-defined client tool with an Anthropic server tool. Explore strict schemas, `tool_choice`, parallel calls, and error results. Distinguish client tools, server tools, Agent SDK built-ins, MCP tools, and hooks.

### Lab03 — Claude Agent SDK fundamentals

Build a read-only support agent using the Agent SDK and its `Read`, `Glob`, and `Grep` tools. Compare the SDK-managed loop with Lab01's manual loop.

### Lab04 — Hooks, permissions, and approval

Allow an agent to draft support replies while a `PreToolUse` hook restricts file writes, a permission callback asks for human approval, and later hooks record an audit trail.

### Lab05 — Build an MCP server

Create a local STDIO MCP server with order tools, a refund-policy resource, and a reusable support prompt. Test it through the MCP protocol rather than by calling implementation functions directly.

### Lab06 — MCP client and Claude bridge

Build a client that discovers MCP tools, resources, and prompts. Bridge the discovered tools into Claude so the model can use an MCP server without knowing its implementation.

### Lab07 — Subagent orchestration

Use the Agent SDK to coordinate an order investigator and a policy specialist. Restrict both agents to read-only tools and synthesize their results into one response.

### Lab08 — Message Batches and evaluation

Submit labeled support cases through the Message Batches API. Match results by `custom_id` and score whether Claude selected the expected tool with valid arguments.

## Common commands

Run these inside an implemented lab:

```bash
npm ci
npm run typecheck
npm test
npm run demo -- "your prompt"
```

Tests are offline. Demo commands that invoke Claude consume Anthropic API credits.

## References

- [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Claude Message Batches](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
