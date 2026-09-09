data "terraform_remote_state" "bootstrap" {
  backend = "local"

  config = {
    path = "${path.module}/../bootstrap/terraform.tfstate"
  }
}

data "aws_caller_identity" "current" {}

locals {
  container_uri = "${data.terraform_remote_state.bootstrap.outputs.ecr_repository_url}:${var.image_tag}"
  runtime_names = {
    coordinator        = "${var.runtime_name_prefix}_coordinator"
    "order-investigator" = "${var.runtime_name_prefix}_order"
    "policy-specialist"  = "${var.runtime_name_prefix}_policy"
  }
  base_environment = {
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
  for_each = local.runtime_names

  name               = "${each.value}_role"
  assume_role_policy = data.aws_iam_policy_document.runtime_assume_role.json
}

data "aws_iam_policy_document" "runtime_common" {
  for_each = local.runtime_names

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
    sid     = "AgentCoreIdentity"
    actions = ["bedrock-agentcore:GetResourceApiKey"]
    resources = [
      "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:workload-identity-directory/default",
      "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:workload-identity-directory/default/workload-identity/${each.value}-*",
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

resource "aws_iam_role_policy" "runtime_common" {
  for_each = local.runtime_names

  name   = "${each.value}_common"
  role   = aws_iam_role.runtime[each.key].id
  policy = data.aws_iam_policy_document.runtime_common[each.key].json
}

resource "aws_bedrockagentcore_agent_runtime" "order_investigator" {
  agent_runtime_name = local.runtime_names["order-investigator"]
  description        = "Lab11 A2A order investigator"
  role_arn           = aws_iam_role.runtime["order-investigator"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE = "order-investigator"
  })

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.container_uri
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "A2A"
  }

  depends_on = [aws_iam_role_policy.runtime_common]
}

resource "aws_bedrockagentcore_agent_runtime" "policy_specialist" {
  agent_runtime_name = local.runtime_names["policy-specialist"]
  description        = "Lab11 A2A refund policy specialist"
  role_arn           = aws_iam_role.runtime["policy-specialist"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE = "policy-specialist"
  })

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.container_uri
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "A2A"
  }

  depends_on = [aws_iam_role_policy.runtime_common]
}

data "aws_iam_policy_document" "coordinator_a2a" {
  statement {
    sid = "DiscoverAndInvokeSpecialists"
    actions = [
      "bedrock-agentcore:GetAgentCard",
      "bedrock-agentcore:InvokeAgentRuntime",
      "bedrock-agentcore:InvokeAgentRuntimeForUser",
    ]
    resources = [
      aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_arn,
      "${aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_arn}/runtime-endpoint/DEFAULT",
      aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_arn,
      "${aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_arn}/runtime-endpoint/DEFAULT",
    ]
  }
}

resource "aws_iam_role_policy" "coordinator_a2a" {
  name   = "${local.runtime_names.coordinator}_a2a"
  role   = aws_iam_role.runtime["coordinator"].id
  policy = data.aws_iam_policy_document.coordinator_a2a.json
}

resource "aws_bedrockagentcore_agent_runtime" "coordinator" {
  agent_runtime_name = local.runtime_names.coordinator
  description        = "Lab11 coordinator that delegates to A2A specialist runtimes"
  role_arn           = aws_iam_role.runtime["coordinator"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE            = "coordinator"
    AGENT_RUNTIME_USER_ID = var.agent_runtime_user_id
    ORDER_AGENT_TARGET    = aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_arn
    POLICY_AGENT_TARGET   = aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_arn
  })

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.container_uri
    }
  }

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "A2A"
  }

  depends_on = [
    aws_iam_role_policy.runtime_common,
    aws_iam_role_policy.coordinator_a2a,
  ]
}
