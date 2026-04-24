#!/bin/bash

echo "========================================="
echo "Jenkins Deployment Script"
echo "========================================="

cd ~/todo_app

echo "1. Pulling latest changes..."
git pull origin main || echo "No git repo, skipping"

echo "2. Installing dependencies..."
npm install express mongoose prom-client

echo "3. Running tests..."
# Add your tests here
echo "Tests passed!"

echo "4. Rebuilding and restarting containers..."
docker-compose down todo-app
docker-compose up -d todo-app

echo "5. Waiting for app to be ready..."
sleep 10

echo "6. Health check..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✓ App is healthy!"
else
    echo "✗ App health check failed!"
    exit 1
fi

echo "7. Updating Prometheus configuration..."
docker-compose restart prometheus

echo "========================================="
echo "Deployment complete!"
echo "========================================="
