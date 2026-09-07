#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lab_dir="$(cd "$script_dir/.." && pwd)"
image_tag="${1:-v1}"

repository_url="$(terraform -chdir="$lab_dir/infra/bootstrap" output -raw ecr_repository_url)"
aws_region="$(terraform -chdir="$lab_dir/infra/bootstrap" output -raw aws_region)"
registry="${repository_url%%/*}"

aws ecr get-login-password --region "$aws_region" \
  | docker login --username AWS --password-stdin "$registry"

docker buildx build \
  --platform linux/arm64 \
  --tag "$repository_url:$image_tag" \
  --push \
  "$lab_dir"

echo "Pushed $repository_url:$image_tag"
