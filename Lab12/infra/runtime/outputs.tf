output "aws_region" {
  value = var.aws_region
}

output "container_uri" {
  value = local.container_uri
}

output "credential_provider_name" {
  value = data.terraform_remote_state.bootstrap.outputs.credential_provider_name
}

output "coordinator_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_arn
}

output "order_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_arn
}

output "policy_runtime_arn" {
  value = aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_arn
}

output "runtime_role_arns" {
  value = { for name, role in aws_iam_role.runtime : name => role.arn }
}

output "coordinator_log_group_name" {
  value = "/aws/bedrock-agentcore/runtimes/${aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id}-DEFAULT"
}

output "online_evaluation_config_arn" {
  value = aws_bedrockagentcore_online_evaluation_config.coordinator.online_evaluation_config_arn
}

output "evaluation_role_arn" {
  value = aws_iam_role.evaluation.arn
}

output "runtime_configs" {
  value = {
    coordinator = {
      id          = aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id
      role_arn    = aws_iam_role.runtime["coordinator"].arn
      environment = aws_bedrockagentcore_agent_runtime.coordinator.environment_variables
    }
    "order-investigator" = {
      id          = aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_id
      role_arn    = aws_iam_role.runtime["order-investigator"].arn
      environment = aws_bedrockagentcore_agent_runtime.order_investigator.environment_variables
    }
    "policy-specialist" = {
      id          = aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_id
      role_arn    = aws_iam_role.runtime["policy-specialist"].arn
      environment = aws_bedrockagentcore_agent_runtime.policy_specialist.environment_variables
    }
  }
}
