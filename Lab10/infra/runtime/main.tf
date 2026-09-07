data "terraform_remote_state" "bootstrap" {
  backend = "local"

  config = {
    path = "${path.module}/../bootstrap/terraform.tfstate"
  }
}

data "aws_caller_identity" "current" {}

locals {
  container_uri = "${data.terraform_remote_state.bootstrap.outputs.ecr_repository_url}:${var.image_tag}"
  runtime_environment = {
    ANTHROPIC_BASE_URL            = var.anthropic_base_url
    AWS_REGION                    = var.aws_region
    CLAUDE_MODEL                  = var.claude_model
    GATEWAY_API_KEY_PROVIDER_NAME = data.terraform_remote_state.bootstrap.outputs.credential_provider_name
  }
}

data "aws_iam_policy_document" "runtime_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:runtime/*"]
    }
  }
}

resource "aws_iam_role" "runtime" {
  name               = "${var.runtime_name}_role"
  assume_role_policy = data.aws_iam_policy_document.runtime_assume_role.json
}

data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "EcrAuthorization"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrImagePull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [data.terraform_remote_state.bootstrap.outputs.ecr_repository_arn]
  }

  statement {
    sid = "RuntimeLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:*",
    ]
  }

  statement {
    sid = "RuntimeTelemetry"
    actions = [
      "cloudwatch:PutMetricData",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments",
    ]
    resources = ["*"]
  }

  statement {
    sid = "AgentCoreIdentity"
    actions = ["bedrock-agentcore:GetResourceApiKey"]
    resources = [
      "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:workload-identity-directory/default",
      "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:workload-identity-directory/default/workload-identity/${var.runtime_name}-*",
      "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:token-vault/default",
      data.terraform_remote_state.bootstrap.outputs.credential_provider_arn,
    ]
  }

  statement {
    sid       = "AgentCoreIdentitySecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.terraform_remote_state.bootstrap.outputs.credential_provider_secret_arn]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "${var.runtime_name}_policy"
  role   = aws_iam_role.runtime.id
  policy = data.aws_iam_policy_document.runtime.json
}

resource "aws_bedrockagentcore_agent_runtime" "coordinator" {
  agent_runtime_name = var.runtime_name
  description        = "Lab10 coordinator using AgentCore Runtime and Identity"
  role_arn           = aws_iam_role.runtime.arn
  environment_variables = local.runtime_environment

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.container_uri
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "HTTP"
  }

  depends_on = [aws_iam_role_policy.runtime]
}
