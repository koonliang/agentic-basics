terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.62.0, < 7.0.0"
    }

    time = {
      source  = "hashicorp/time"
      version = "~> 0.14.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Lab = "agentic-basics-lab16"
    }
  }
}
