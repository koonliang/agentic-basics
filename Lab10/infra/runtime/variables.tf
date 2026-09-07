variable "aws_region" {
  description = "AWS Region for Lab10 resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "runtime_name" {
  description = "AgentCore Runtime name."
  type        = string
  default     = "agentic_basics_lab10"
}

variable "image_tag" {
  description = "Immutable ECR image tag deployed to AgentCore Runtime."
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
