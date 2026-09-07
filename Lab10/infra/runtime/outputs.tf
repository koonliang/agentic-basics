output "agent_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_arn
}

output "agent_runtime_id" {
  value = aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id
}

output "aws_region" {
  value = var.aws_region
}

output "anthropic_base_url" {
  value = var.anthropic_base_url
}

output "claude_model" {
  value = var.claude_model
}

output "container_uri" {
  value = local.container_uri
}

output "credential_provider_name" {
  value = data.terraform_remote_state.bootstrap.outputs.credential_provider_name
}

output "runtime_environment" {
  value = local.runtime_environment
}

output "runtime_role_arn" {
  value = aws_iam_role.runtime.arn
}
