variable "aws_region" {
  description = "AWS Region for Lab11 resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "runtime_name_prefix" {
  description = "Prefix for the three AgentCore Runtime names."
  type        = string
  default     = "agentic_basics_lab11"
}

variable "image_tag" {
  description = "Immutable ECR image tag deployed to every runtime."
  type        = string
  default     = "v1"
}

variable "anthropic_base_url" {
  description = "Base URL of the Anthropic-compatible model gateway."
  type        = string
}

variable "claude_model" {
  description = "Model identifier accepted by the gateway."
  type        = string
}

variable "agent_runtime_user_id" {
  description = "Development user ID propagated from the coordinator to specialists."
  type        = string
  default     = "lab11-demo-user"
}
