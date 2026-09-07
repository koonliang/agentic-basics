resource "aws_ecr_repository" "runtime" {
  name                 = "${var.name_prefix}-runtime"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_bedrockagentcore_api_key_credential_provider" "gateway" {
  name               = "${var.name_prefix}-gateway"
  api_key_wo         = var.gateway_api_key
  api_key_wo_version = var.gateway_api_key_version
}
