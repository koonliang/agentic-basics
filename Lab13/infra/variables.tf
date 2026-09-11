variable "aws_region" {
  description = "AWS Region for the knowledge base and storage resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  description = "Prefix used for Lab13 resource names."
  type        = string
  default     = "agentic-basics-lab13"
}
