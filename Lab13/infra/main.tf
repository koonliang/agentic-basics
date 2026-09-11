data "aws_caller_identity" "current" {}

locals {
  document_bucket_name = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-documents"
  embedding_model_arn  = "arn:aws:bedrock:${var.aws_region}::foundation-model/cohere.embed-english-v3"
  vector_bucket_name   = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-vectors"
  vector_index_name    = "policy-documents"
}

resource "aws_s3_bucket" "documents" {
  bucket        = local.document_bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3vectors_vector_bucket" "documents" {
  vector_bucket_name = local.vector_bucket_name
  force_destroy      = true
}

resource "aws_s3vectors_index" "documents" {
  index_name         = local.vector_index_name
  vector_bucket_name = aws_s3vectors_vector_bucket.documents.vector_bucket_name
  data_type          = "float32"
  dimension          = 1024
  distance_metric    = "cosine"

  metadata_configuration {
    non_filterable_metadata_keys = [
      "AMAZON_BEDROCK_TEXT",
      "AMAZON_BEDROCK_METADATA",
    ]
  }
}

data "aws_iam_policy_document" "knowledge_base_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:knowledge-base/*"]
    }
  }
}

resource "aws_iam_role" "knowledge_base" {
  name               = "${var.name_prefix}-knowledge-base"
  assume_role_policy = data.aws_iam_policy_document.knowledge_base_assume_role.json
}

data "aws_iam_policy_document" "knowledge_base" {
  statement {
    sid       = "InvokeEmbeddingModel"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }

  statement {
    sid       = "ListDocumentBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["documents/*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "ReadDocuments"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.documents.arn}/documents/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid = "ReadWriteVectorIndex"
    actions = [
      "s3vectors:PutVectors",
      "s3vectors:GetVectors",
      "s3vectors:DeleteVectors",
      "s3vectors:QueryVectors",
      "s3vectors:GetIndex",
    ]
    resources = [aws_s3vectors_index.documents.index_arn]
  }
}

resource "aws_iam_role_policy" "knowledge_base" {
  name   = "${var.name_prefix}-knowledge-base"
  role   = aws_iam_role.knowledge_base.id
  policy = data.aws_iam_policy_document.knowledge_base.json
}

data "aws_iam_policy_document" "vector_bucket" {
  statement {
    sid    = "AllowKnowledgeBaseAccess"
    effect = "Allow"

    # The account principal is immediately valid; the condition keeps access scoped to the role.
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:PrincipalArn"
      values   = [aws_iam_role.knowledge_base.arn]
    }

    actions = [
      "s3vectors:PutVectors",
      "s3vectors:GetVectors",
      "s3vectors:DeleteVectors",
      "s3vectors:QueryVectors",
      "s3vectors:GetIndex",
    ]
    resources = [aws_s3vectors_index.documents.index_arn]
  }
}

resource "aws_s3vectors_vector_bucket_policy" "documents" {
  vector_bucket_arn = aws_s3vectors_vector_bucket.documents.vector_bucket_arn
  policy            = data.aws_iam_policy_document.vector_bucket.json
}

resource "aws_bedrockagent_knowledge_base" "policies" {
  name     = replace(var.name_prefix, "-", "_")
  role_arn = aws_iam_role.knowledge_base.arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = local.embedding_model_arn
    }
  }

  storage_configuration {
    type = "S3_VECTORS"

    s3_vectors_configuration {
      index_arn = aws_s3vectors_index.documents.index_arn
    }
  }

  depends_on = [
    aws_iam_role_policy.knowledge_base,
    aws_s3vectors_vector_bucket_policy.documents,
  ]
}

resource "aws_bedrockagent_data_source" "policies" {
  knowledge_base_id    = aws_bedrockagent_knowledge_base.policies.id
  name                 = "current_policy_documents"
  data_deletion_policy = "DELETE"

  lifecycle {
    replace_triggered_by = [aws_bedrockagent_knowledge_base.policies.id]
  }

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn         = aws_s3_bucket.documents.arn
      inclusion_prefixes = ["documents/"]
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "FIXED_SIZE"

      fixed_size_chunking_configuration {
        max_tokens         = 300
        overlap_percentage = 20
      }
    }
  }
}
