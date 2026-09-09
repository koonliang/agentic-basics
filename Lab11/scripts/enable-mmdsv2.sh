#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lab_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="$lab_dir/infra/runtime"

runtime_configs="$(terraform -chdir="$runtime_dir" output -json runtime_configs)"
container_uri="$(terraform -chdir="$runtime_dir" output -raw container_uri)"
aws_region="$(terraform -chdir="$runtime_dir" output -raw aws_region)"

while IFS=$'\t' read -r name runtime_id role_arn environment_base64; do
  require_mmdsv2="$(aws bedrock-agentcore-control get-agent-runtime \
    --region "$aws_region" \
    --agent-runtime-id "$runtime_id" \
    --query 'metadataConfiguration.requireMMDSV2' \
    --output text)"

  if [[ "$require_mmdsv2" == "True" || "$require_mmdsv2" == "true" ]]; then
    echo "MMDSv2 is already required for $name ($runtime_id)"
    continue
  fi

  environment_json="$(node -e 'process.stdout.write(Buffer.from(process.argv[1], "base64").toString())' "$environment_base64")"
  aws bedrock-agentcore-control update-agent-runtime \
    --region "$aws_region" \
    --agent-runtime-id "$runtime_id" \
    --agent-runtime-artifact "containerConfiguration={containerUri=$container_uri}" \
    --role-arn "$role_arn" \
    --network-configuration "networkMode=PUBLIC" \
    --protocol-configuration "serverProtocol=A2A" \
    --environment-variables "$environment_json" \
    --metadata-configuration "requireMMDSV2=true"

  echo "Requested an MMDSv2-enabled version for $name ($runtime_id)"
done < <(node -e '
  const configs = JSON.parse(process.argv[1]);
  for (const [name, config] of Object.entries(configs)) {
    const environment = Buffer.from(JSON.stringify(config.environment)).toString("base64");
    console.log([name, config.id, config.role_arn, environment].join("\t"));
  }
' "$runtime_configs")
