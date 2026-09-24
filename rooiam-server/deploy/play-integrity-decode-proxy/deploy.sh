#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 PROJECT_NUMBER [REGION]" >&2
  exit 2
fi

project_number="$1"
region="${2:-asia-southeast1}"
service="rooiam-play-integrity-decode"
secret_name="rooiam-play-integrity-proxy-secret"
secret_file="$HOME/rooiam-secrets/play-integrity-proxy-secret"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

project_id="$(gcloud projects describe "$project_number" --format='value(projectId)')"
if [[ -z "$project_id" ]]; then
  echo "Cannot resolve Google Cloud project number $project_number" >&2
  exit 1
fi
service_account="rooiam-play-integrity@$project_id.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$service_account" --project "$project_id" >/dev/null

gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com playintegrity.googleapis.com \
  --project "$project_id"

# Cloud Run source deployments use the Compute Engine default account for
# Cloud Build unless a different build identity is configured. New projects
# do not necessarily grant it access to the uploaded source archive.
build_service_account="$project_number-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$project_id" \
  --member "serviceAccount:$build_service_account" \
  --role roles/run.builder >/dev/null

umask 077
mkdir -p "$(dirname "$secret_file")"
if gcloud secrets describe "$secret_name" --project "$project_id" >/dev/null 2>&1; then
  gcloud secrets versions access latest --secret "$secret_name" \
    --project "$project_id" > "$secret_file"
else
  openssl rand -hex 32 > "$secret_file"
  gcloud secrets create "$secret_name" --project "$project_id" \
    --data-file="$secret_file"
fi
chmod 600 "$secret_file"

secret_version="$(gcloud secrets versions list "$secret_name" --project "$project_id" \
  --filter='state=ENABLED' --sort-by='~createTime' --limit=1 \
  --format='value(name)' | awk -F/ '{print $NF}')"
if [[ ! "$secret_version" =~ ^[0-9]+$ ]]; then
  echo "Cannot determine an enabled Secret Manager version" >&2
  exit 1
fi

gcloud secrets add-iam-policy-binding "$secret_name" --project "$project_id" \
  --member "serviceAccount:$service_account" \
  --role roles/secretmanager.secretAccessor >/dev/null

gcloud run deploy "$service" --source "$source_dir" \
  --project "$project_id" --region "$region" \
  --service-account "$service_account" \
  --set-env-vars ROOIAM_ALLOWED_PACKAGE_NAME=com.rooiam.reference \
  --set-secrets "ROOIAM_PROXY_SHARED_SECRET=$secret_name:$secret_version" \
  --allow-unauthenticated --max-instances=2

echo "Decoder URL: $(gcloud run services describe "$service" \
  --project "$project_id" --region "$region" --format='value(status.url)')"
echo "Private secret file: $secret_file"
echo "Transfer that file securely to the Rooiam host; do not paste its contents into chat or Git."
