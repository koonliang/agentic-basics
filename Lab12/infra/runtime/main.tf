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
    AGENT_OBSERVABILITY_ENABLED         = "true"
    ANTHROPIC_BASE_URL                  = var.anthropic_base_url
    AWS_REGION                          = var.aws_region
    CLAUDE_MODEL                        = var.claude_model
    GATEWAY_API_KEY_PROVIDER_NAME       = data.terraform_remote_state.bootstrap.outputs.credential_provider_name
    OTEL_BAGGAGE_SPAN_ATTRIBUTE_KEYS    = "session.id"
    UNIFIED_TRACES_DESTINATION_ENABLED = "true"
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
      "logs:PutResourcePolicy",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*:*",
    ]
  }

  statement {
    sid       = "DescribeLogGroups"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:*"]
  }

  statement {
    sid = "RuntimeTelemetry"
    actions = [
      "cloudwatch:PutMetricData",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
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
  description        = "Lab12 observable A2A order investigator"
  role_arn           = aws_iam_role.runtime["order-investigator"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE        = "order-investigator"
    OTEL_SERVICE_NAME = local.runtime_names["order-investigator"]
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
  description        = "Lab12 observable A2A refund policy specialist"
  role_arn           = aws_iam_role.runtime["policy-specialist"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE        = "policy-specialist"
    OTEL_SERVICE_NAME = local.runtime_names["policy-specialist"]
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
  description        = "Lab12 observable coordinator that delegates to A2A specialist runtimes"
  role_arn           = aws_iam_role.runtime["coordinator"].arn
  environment_variables = merge(local.base_environment, {
    AGENT_ROLE            = "coordinator"
    AGENT_RUNTIME_USER_ID = var.agent_runtime_user_id
    ORDER_AGENT_TARGET    = aws_bedrockagentcore_agent_runtime.order_investigator.agent_runtime_arn
    POLICY_AGENT_TARGET   = aws_bedrockagentcore_agent_runtime.policy_specialist.agent_runtime_arn
    OTEL_SERVICE_NAME     = local.runtime_names.coordinator
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

data "aws_iam_policy_document" "evaluation_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

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
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:evaluator/*",
        "arn:aws:bedrock-agentcore:${var.aws_region}:${data.aws_caller_identity.current.account_id}:online-evaluation-config/*",
      ]
    }
  }
}

resource "aws_iam_role" "evaluation" {
  name               = "${var.runtime_name_prefix}_evaluation_role"
  assume_role_policy = data.aws_iam_policy_document.evaluation_assume_role.json
}

data "aws_iam_policy_document" "evaluation" {
  statement {
    sid = "QueryCoordinatorSpans"
    actions = [
      "logs:DescribeLogGroups",
      "logs:GetQueryResults",
      "logs:StartQuery",
    ]
    resources = ["*"]
  }

  statement {
    sid = "WriteEvaluationResults"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/evaluations/*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/evaluations/*:*",
    ]
  }

  statement {
    sid = "IndexCoordinatorSpans"
    actions = [
      "logs:DescribeIndexPolicies",
      "logs:PutIndexPolicy",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:aws/spans",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:aws/spans:*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/${aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id}-DEFAULT",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/${aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id}-DEFAULT:*",
    ]
  }

  statement {
    sid       = "InvokeEvaluatorModels"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/*",
      "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }
}

resource "aws_iam_role_policy" "evaluation" {
  name   = "${var.runtime_name_prefix}_evaluation"
  role   = aws_iam_role.evaluation.id
  policy = data.aws_iam_policy_document.evaluation.json
}

resource "aws_bedrockagentcore_online_evaluation_config" "coordinator" {
  online_evaluation_config_name = "${var.runtime_name_prefix}_online"
  description                   = "Continuous quality monitoring for the Lab12 coordinator"
  enable_on_create              = var.online_evaluation_enabled
  evaluation_execution_role_arn = aws_iam_role.evaluation.arn

  data_source_config {
    cloudwatch_logs {
      log_group_names = ["/aws/bedrock-agentcore/runtimes/${aws_bedrockagentcore_agent_runtime.coordinator.agent_runtime_id}-DEFAULT"]
      service_names   = [local.runtime_names.coordinator]
    }
  }

  evaluator {
    evaluator_id = "Builtin.ToolSelectionAccuracy"
  }

  evaluator {
    evaluator_id = "Builtin.Faithfulness"
  }

  evaluator {
    evaluator_id = "Builtin.Correctness"
  }

  rule {
    sampling_config {
      sampling_percentage = var.online_evaluation_sampling_percentage
    }

    session_config {
      session_timeout_minutes = 1
    }
  }

  depends_on = [aws_iam_role_policy.evaluation]
}
