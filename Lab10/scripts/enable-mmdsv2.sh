#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lab_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="$lab_dir/infra/runtime"

runtime_id="$(terraform -chdir="$runtime_dir" output -raw agent_runtime_id)"
runtime_role_arn="$(terraform -chdir="$runtime_dir" output -raw runtime_role_arn)"
container_uri="$(terraform -chdir="$runtime_dir" output -raw container_uri)"
aws_region="$(terraform -chdir="$runtime_dir" output -raw aws_region)"
provider_name="$(terraform -chdir="$runtime_dir" output -raw credential_provider_name)"
base_url="$(terraform -chdir="$runtime_dir" output -raw anthropic_base_url)"
model="$(terraform -chdir="$runtime_dir" output -raw claude_model)"

require_mmdsv2="$(aws bedrock-agentcore-control get-agent-runtime \
  --region "$aws_region" \
  --agent-runtime-id "$runtime_id" \
  --query 'metadataConfiguration.requireMMDSV2' \
  --output text)"

if [[ "$require_mmdsv2" == "True" || "$require_mmdsv2" == "true" ]]; then
  echo "MMDSv2 is already required for $runtime_id"
  exit 0
fi

aws bedrock-agentcore-control update-agent-runtime \
  --region "$aws_region" \
  --agent-runtime-id "$runtime_id" \
  --agent-runtime-artifact "containerConfiguration={containerUri=$container_uri}" \
  --role-arn "$runtime_role_arn" \
  --network-configuration "networkMode=PUBLIC" \
  --protocol-configuration "serverProtocol=HTTP" \
  --environment-variables \
    "ANTHROPIC_BASE_URL=$base_url,AWS_REGION=$aws_region,CLAUDE_MODEL=$model,GATEWAY_API_KEY_PROVIDER_NAME=$provider_name" \
  --metadata-configuration "requireMMDSV2=true"

echo "Requested an MMDSv2-enabled runtime version for $runtime_id"
