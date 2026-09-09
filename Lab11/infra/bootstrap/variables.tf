variable "aws_region" {
  description = "AWS Region for Lab11 resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  description = "Prefix for Lab11 resource names."
  type        = string
  default     = "agentic-basics-lab11"
}

variable "gateway_api_key" {
  description = "API key stored by AgentCore Identity. Pass it with TF_VAR_gateway_api_key."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "gateway_api_key_version" {
  description = "Increment this number when rotating the gateway API key."
  type        = number
  default     = 1
}
