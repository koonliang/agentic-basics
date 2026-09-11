output "document_bucket" {
  description = "S3 bucket used by the knowledge base data source."
  value       = aws_s3_bucket.documents.bucket
}

output "knowledge_base_id" {
  description = "Bedrock Knowledge Base identifier used by retrieval."
  value       = aws_bedrockagent_knowledge_base.policies.id
}

output "data_source_id" {
  description = "Bedrock data source identifier used by ingestion jobs."
  value       = aws_bedrockagent_data_source.policies.data_source_id
}

output "vector_index_arn" {
  description = "S3 Vectors index receiving document embeddings."
  value       = aws_s3vectors_index.documents.index_arn
}
