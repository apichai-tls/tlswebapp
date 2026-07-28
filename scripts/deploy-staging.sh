#!/bin/bash

# Configuration
SERVICE_NAME="tls-staging"
REGION="asia-southeast1" # Update if your region is different

echo "===================================================="
echo " Deploying That Laundry Shop to Cloud Run (Staging) "
echo "===================================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null
then
    echo "Error: gcloud CLI could not be found. Please install it first."
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "Error: No GCP project is currently set."
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "Project ID : $PROJECT_ID"
echo "Service    : $SERVICE_NAME"
echo "Region     : $REGION"
echo "===================================================="

# Run E2E tests before deploying
# echo "Running E2E tests before deploying..."
# npm run test:e2e
# if [ $? -ne 0 ]; then
#     echo "❌ Error: E2E tests failed. Deployment aborted!"
#     exit 1
# fi
# echo "✅ E2E tests passed successfully. Proceeding with deployment..."
echo "⚠️ Skipping E2E tests for now (disabled in deploy script). Proceeding with deployment..."
echo "===================================================="

# Submit the build and deploy
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --max-instances 5 \
  --quiet

echo "===================================================="
echo " Deployment process finished."
echo " Note: Ensure your DATABASE_URL and other environment variables"
echo " are properly configured in the Cloud Run console for this service."
echo " The entrypoint will automatically push DB schema changes on startup."
echo "===================================================="
