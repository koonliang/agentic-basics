variable "aws_region" {
  description = "AWS Region for the knowledge base and storage resources. Lab16 uses Nova Lite's APAC profile from Singapore."
  type        = string
  default     = "ap-southeast-1"

  validation {
    condition     = var.aws_region == "ap-southeast-1"
    error_message = "Lab16 must use ap-southeast-1 with its built-in APAC Nova Lite parser profile."
  }
}

variable "name_prefix" {
  description = "Prefix used for Lab16 resource names."
  type        = string
  default     = "agentic-basics-lab16"
}
