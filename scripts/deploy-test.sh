#!/bin/bash

# Configuration
SERVICE_NAME="tls-test"
REGION="asia-southeast1" # Update if your region is different

echo "===================================================="
echo " Deploying That Laundry Shop to Cloud Run (Test)    "
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
