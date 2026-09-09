# Agentic AI Basics

Hands-on labs for learning how LLM agents decide what to do, call tools, handle results, and coordinate work. The examples use Node.js, TypeScript, and Claude.

Each lab is self-contained: enter its directory, install its dependencies, and follow its README. Labs do not import code from one another.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- An Anthropic API key with API billing enabled for labs that call Claude
- Docker with Buildx for the AgentCore ARM64 container labs
- AWS CLI v2, Terraform 1.11 or later, and configured AWS credentials for Lab10 and Lab11

A Claude subscription and Anthropic API usage are billed separately. Keep API keys in the root `.env` file and never commit them.

## Shared environment

All labs load one environment file from the repository root. Create it once:

```bash
cp .env.example .env
```

The shared file contains:

| Variable | Used by |
| --- | --- |
| `ANTHROPIC_API_KEY` | Labs that call Claude |
| `ANTHROPIC_BASE_URL` | Anthropic SDK and Agent SDK labs |
| `CLAUDE_MODEL` | Labs that call Claude |
| `GATEWAY_API_KEY_VERSION` | Lab10 and Lab11 AgentCore Identity credential rotation |
| `AWS_REGION` | Lab10 and Lab11 AWS resources and remote clients |
| `AGENT_RUNTIME_USER_ID` | Lab10 and Lab11 development identity for remote invocation |
| `PORT` | Lab05 MCP server |
| `MCP_SERVER_URL` | Lab06 MCP client |

If you change `PORT`, update the port in `MCP_SERVER_URL` to match. Existing shell environment variables take precedence over values loaded from `.env`.

## Learning path

| Lab | Topic | Status |
| --- | --- | --- |
| [Lab01](./Lab01/README.md) | Build a manual agent loop that calls a custom tool | Implemented |
| [Lab02](./Lab02/README.md) | Compare client and server tools; classify other tool types | Implemented |
| [Lab03](./Lab03/README.md) | Build a read-only agent with the Claude Agent SDK | Implemented |
| [Lab04](./Lab04/README.md) | Add hooks, permissions, and human approval | Implemented |
| [Lab05](./Lab05/README.md) | Build a local Streamable HTTP MCP server | Implemented |
| [Lab06](./Lab06/README.md) | Connect an HTTP MCP client and bridge its tools to Claude | Implemented |
| [Lab07](./Lab07/README.md) | Coordinate specialist subagents | Implemented |
| [Lab08](./Lab08/README.md) | Evaluate agent tool choices with Message Batches | Implemented |
| [Lab09](./Lab09/README.md) | Package a Claude Agent SDK coordinator for AgentCore Runtime | Implemented |
| [Lab10](./Lab10/README.md) | Deploy the container with Terraform, ECR, IAM, and AgentCore Identity | Implemented |
| [Lab11](./Lab11/README.md) | Split the coordinator and specialists across AgentCore runtimes using A2A | Implemented |
| Lab12 | Add CloudWatch AgentCore Observability and AgentCore Evaluations | Planned |

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

Create a local Streamable HTTP MCP server with order tools, a refund-policy resource, and a reusable support prompt. Test it through the MCP protocol rather than by calling implementation functions directly.

### Lab06 — MCP client and Claude bridge

Build a client that connects to Lab05 through `MCP_SERVER_URL`, discovers MCP tools, resources, and prompts, and bridges the tools into Claude without knowing their implementation.

### Lab07 — Subagent orchestration

Use the Agent SDK to coordinate an order investigator and a policy specialist. Restrict both agents to read-only tools and synthesize their results into one response.

### Lab08 — Message Batches and evaluation

Submit labeled support cases through the Message Batches API. Match results by `custom_id` and score whether Claude selected the expected tool with valid arguments.

### Lab09 — AgentCore-compatible container

Wrap Lab07's coordinator with the AgentCore Runtime HTTP contract, stream orchestration events, and package the application as a Linux ARM64 container. Run the container locally with the Anthropic API before introducing AWS deployment.

### Lab10 — Deploy to AgentCore Runtime

Provision ECR, AgentCore Identity, a least-privilege execution role, and AgentCore Runtime in two Terraform stages. Push the Linux ARM64 image, keep the gateway API key out of runtime environment variables, and invoke the deployed runtime through the AWS SDK.

### Lab11 — Multi-runtime orchestration with A2A

Deploy the coordinator and each specialist as separate AgentCore runtimes. Use the Agent2Agent protocol so the coordinator can discover and delegate work to independently deployed specialists.

### Lab12 — Observability and evaluations

Instrument the distributed workflow with CloudWatch AgentCore Observability, then define AgentCore Evaluations that measure specialist selection, evidence quality, and final-answer correctness.

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
- [Amazon Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html)
