# Lab12 — AgentCore Observability and Evaluations

Lab12 extends the three-runtime A2A workflow from Lab11 with correlated OpenTelemetry traces, custom metrics, curated on-demand evaluations, and continuous online evaluation.

The shared image manually instruments the ESM Anthropic and Claude Agent SDK modules with OpenInference. Each A2A request creates an `AGENT` span, coordinator delegation creates `TOOL` spans, and W3C trace context plus `session.id` baggage flows to both specialist runtimes. Existing progress events remain available over A2A and as correlated JSON logs.

## Prerequisites

- Node.js 22 or later, Docker Buildx, AWS CLI v2, and Terraform 1.11 or later
- AgentCore Runtime, Observability, and Evaluations access in `ap-southeast-1`
- CloudWatch Transaction Search enabled once for the account and Region
- An Anthropic API key and access to the configured model

Before deploying, follow AWS's [AgentCore observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html) to enable Transaction Search and its CloudWatch resource policy. This account-level prerequisite is intentionally not managed by this lab's Terraform.

## Run locally

Use the repository root `.env`, then install and start all roles:

```bash
cd Lab12
npm ci
docker compose up --build
npm run demo:local -- "Investigate cases/case-001.md using both specialists."
```

Compose sets `AGENT_OBSERVABILITY_ENABLED=false`, so local runs do not attempt to export telemetry to AWS. Structured progress remains visible. Stop the stack with `docker compose down`.

## Deploy

Load the same variables used by Lab11, with Lab12 defaults:

```bash
set -a
source ../.env
set +a

export AWS_REGION="${AWS_REGION:-ap-southeast-1}"
export TF_VAR_aws_region="$AWS_REGION"
export TF_VAR_gateway_api_key="$ANTHROPIC_API_KEY"
export TF_VAR_gateway_api_key_version="${GATEWAY_API_KEY_VERSION:-1}"
export TF_VAR_anthropic_base_url="$ANTHROPIC_BASE_URL"
export TF_VAR_claude_model="$CLAUDE_MODEL"
export TF_VAR_agent_runtime_user_id="${AGENT_RUNTIME_USER_ID:-lab12-demo-user}"
```

Review and apply the bootstrap stage, push the ARM64 image, and then review and apply the runtime stage:

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
npm run image:push -- v1
export TF_VAR_image_tag=v1
terraform -chdir=infra/runtime init
terraform -chdir=infra/runtime apply
npm run runtime:secure
```

The runtime environment enables the ADOT preloader and unified trace destinations. Terraform also creates an evaluation execution role and an online configuration for `Builtin.ToolSelectionAccuracy`, `Builtin.Faithfulness`, and `Builtin.Correctness`. The online configuration reads the coordinator runtime log group, where unified tracing writes both spans and runtime events. It samples 100% by default for learning; reduce `online_evaluation_sampling_percentage` for production cost control.

## Inspect observability

Invoke the coordinator and note its printed session ID:

```bash
export AGENT_RUNTIME_ARN="$(terraform -chdir=infra/runtime output -raw coordinator_runtime_arn)"
npm run demo -- "Investigate cases/case-001.md using both specialists."
```

Open CloudWatch's AgentCore Observability view or inspect `/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT`. Unified telemetry places spans in that group's `spans` stream. Deployments using split telemetry place spans in `aws/spans` and correlated input/output events in the runtime group's `otel-rt-logs` stream. Runtime logs include `traceId`, `spanId`, and `sessionId`. Custom metrics are emitted as `agentic_basics.operations` and `agentic_basics.operation.duration`, dimensioned by role, operation, outcome, and specialist when applicable.

## Run curated on-demand evaluations

Run all three fixtures, or pass one fixture ID:

```bash
npm run eval:ondemand
npm run eval:ondemand -- damaged-delivery-refund
```

The runner invokes a fresh coordinator session, waits up to ten minutes for CloudWatch ingestion, and calls AgentCore's synchronous Evaluate API. It searches both unified and split telemetry locations, prints collection progress every 30 seconds, and combines correlated span/event records when necessary. It checks trajectory matching, faithfulness, and correctness against `evaluations/cases.json`. Scores, labels, evaluator errors, and explanations are printed. A low score does not fail the process; invocation, telemetry, or API failures do.

The invoking principal needs coordinator invocation, `logs:FilterLogEvents` on the runtime group and `aws/spans`, and `bedrock-agentcore:Evaluate`. Set `AGENT_LOG_GROUP` only when the primary runtime group differs from the standard name; the shared `aws/spans` fallback is always searched. Evaluations and OpenInference spans include fixture prompts, tool parameters, model inputs, and outputs. These fixtures contain only synthetic data. For production, configure OpenInference masking/redaction, avoid secrets and personal data in attributes, restrict log access, set retention, and lower sampling.

## Verify and clean up

Offline checks do not modify AWS:

```bash
npm run typecheck
npm test
npm run build
docker buildx build --platform linux/arm64 --load -t agentic-ai-lab12:local .
```

Destroy the dependent runtime stage before bootstrap when finished:

```bash
terraform -chdir=infra/runtime destroy
terraform -chdir=infra/bootstrap destroy
```

Evaluations can invoke evaluator models and incur charges. CloudWatch log ingestion, storage, custom metrics, AgentCore runtimes, and Anthropic calls can also incur charges.

## References

- [Configure AgentCore Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html)
- [Supported telemetry frameworks](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/supported-frameworks-telemetry.html)
- [Ground-truth evaluations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/ground-truth-evaluations.html)
- [Terraform online evaluation configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_online_evaluation_config)
