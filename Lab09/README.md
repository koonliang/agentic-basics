# Lab09 — Package an agent for AgentCore

Lab09 takes the coordinator from Lab07 and gives it the HTTP and container boundary required by Amazon Bedrock AgentCore Runtime. The coordinator and both Claude Agent SDK subagents still run in one process; distribution across separate runtimes comes later.

This lab runs locally and continues to use the Anthropic API. It does not create AWS resources.

## Learning objectives

By the end of this lab, you will be able to explain:

- which responsibilities belong to the agent framework and which belong to AgentCore Runtime;
- how `BedrockAgentCoreApp` exposes the Runtime HTTP contract;
- why invocation payloads must be validated before reaching an agent framework;
- why the container installs the Claude Agent SDK for Linux ARM64; and
- how tool activity can be streamed separately from the final answer.

## Architecture

```text
POST /invocations { prompt }
             |
             v
  BedrockAgentCoreApp :8080
             |
             v
  Claude Agent SDK coordinator
       |                 |
       v                 v
order-investigator  policy-specialist
 Read/Glob/Grep      Read/Glob/Grep
       |                 |
       +--------+--------+
                v
       streamed trace + final events
```

AgentCore supplies the hosting contract. The Claude Agent SDK still controls model turns, subagent delegation, tool execution, and synthesis.

## Runtime contract

The TypeScript `bedrock-agentcore` package starts an HTTP server on `0.0.0.0:8080` and supplies the health endpoint.

`POST /invocations` accepts one shape:

```json
{ "prompt": "Investigate cases/case-001.md using both specialists." }
```

The prompt must be a non-empty string. Objects, arrays, blank strings, and missing prompts are rejected before they reach the Claude Agent SDK. Successful requests stream:

- `trace` events for initialization, tool requests, and tool results; and
- one `final` event containing `{ "response": "..." }`.

`GET /ping` returns the Runtime health state. AgentCore uses this endpoint to determine whether the container is ready.

## Setup

Requirements:

- Node.js 22 or later;
- npm 10 or later;
- Docker with Buildx and ARM64 emulation when the host is not ARM64; and
- an Anthropic API key with API billing enabled.

From the repository root:

```bash
cp .env.example .env
cd Lab09
npm ci
```

Lab09 reads these existing values from the root `.env` file:

```dotenv
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-haiku-4-5
```

Do not copy `.env` into this directory or the image.

## Run without Docker

Start the Runtime-compatible server:

```bash
LAB09_PORT=18080 npm run server
```

In another terminal, check its health:

```bash
curl http://127.0.0.1:18080/ping
```

Then run the client:

```bash
LAB09_PORT=18080 npm run demo -- "Investigate cases/case-001.md using both specialists."
```

The client prints the response stream. Exact model wording and tool order can vary.
The client creates the session ID required by the AgentCore Runtime protocol for each invocation.

## Build and run the ARM64 container

Build the same architecture required by AgentCore Runtime:

```bash
docker buildx build --platform linux/arm64 -t agentic-lab09:local --load .
```

Run the image while passing configuration at runtime:

```bash
docker run --rm --platform linux/arm64 \
  --env-file ../.env \
  -p 18080:8080 \
  agentic-lab09:local
```

Check `http://127.0.0.1:18080/ping` and run the demo with `LAB09_PORT=18080`. Stop the foreground container with `Ctrl+C`.

The image uses two stages. The first compiles TypeScript. The second installs production packages inside Linux ARM64, preserving the correct architecture and executable permissions for the native CLI bundled with the Claude Agent SDK. The server runs as the unprivileged `node` user.

## Safety boundaries

- The two specialists receive only `Read`, `Glob`, and `Grep`.
- `permissionMode: "dontAsk"` denies unapproved tool requests.
- The prompt is validated as a string before the agent sees it.
- The image contains fixture data, not API credentials.
- `maxTurns` limits coordinator and specialist loops.

These are application-level restrictions, not a complete operating-system security policy.

## Verify offline

```bash
npm run typecheck
npm test
npm run build
```

The tests do not start a server or call Claude. They verify coordinator restrictions, event labeling, input validation, trace/final streaming, and failed completion.

## Experiments

1. Send `{ "prompt": {} }` with `curl` and observe that validation rejects it.
2. Compare the event stream with the terminal trace from Lab07.
3. Remove `Agent` from the coordinator tools and observe that it can no longer delegate.
4. Build without `--platform linux/arm64` and inspect the resulting image architecture.

## Source map

- `src/agent.ts`: coordinator, subagents, and Agent SDK event conversion
- `src/runtime.ts`: validated invocation and trace/final event stream
- `src/index.ts`: thin `BedrockAgentCoreApp` entrypoint
- `src/local-client.ts`: local streaming client
- `Dockerfile`: ARM64 multi-stage runtime image
- `workspace/`: bundled support evidence

## Troubleshooting

- **Port already in use:** choose another available host port and use the same `LAB09_PORT` value for the local server and demo, or map that host port to container port `8080`.
- **Missing model:** set `CLAUDE_MODEL` in the root `.env` file.
- **Authentication error:** verify `ANTHROPIC_API_KEY`; a Claude subscription does not include API usage.
- **Container exits during model use:** confirm the API variables were passed with `--env-file`.
- **Build reports an architecture error:** use Docker Buildx with `--platform linux/arm64`.

## Key takeaway

Containerizing an agent does not move orchestration into AgentCore. It gives the existing orchestration logic a standard, isolated hosting boundary that can be deployed to AgentCore Runtime in the next lab.

## References

- [AgentCore Runtime HTTP protocol](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)
- [AgentCore TypeScript samples](https://github.com/awslabs/bedrock-agentcore-samples-typescript)
- [Claude Agent SDK subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
