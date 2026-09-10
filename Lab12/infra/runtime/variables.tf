variable "aws_region" {
  description = "AWS Region for Lab12 resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "runtime_name_prefix" {
  description = "Prefix for the three AgentCore Runtime names."
  type        = string
  default     = "agentic_basics_lab12"
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
  default     = "lab12-demo-user"
}

variable "online_evaluation_enabled" {
  description = "Enable continuous AgentCore evaluation after creation."
  type        = bool
  default     = true
}

variable "online_evaluation_sampling_percentage" {
  description = "Percentage of completed sessions evaluated online."
  type        = number
  default     = 100

  validation {
    condition     = var.online_evaluation_sampling_percentage >= 0.01 && var.online_evaluation_sampling_percentage <= 100
    error_message = "Sampling percentage must be between 0.01 and 100."
  }
}
