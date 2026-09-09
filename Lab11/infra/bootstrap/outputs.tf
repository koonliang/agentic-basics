output "aws_region" {
  value = var.aws_region
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.runtime.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.runtime.repository_url
}

output "credential_provider_arn" {
  value = aws_bedrockagentcore_api_key_credential_provider.gateway.credential_provider_arn
}

output "credential_provider_name" {
  value = aws_bedrockagentcore_api_key_credential_provider.gateway.name
}

output "credential_provider_secret_arn" {
  value = aws_bedrockagentcore_api_key_credential_provider.gateway.api_key_secret_arn[0].secret_arn
}
