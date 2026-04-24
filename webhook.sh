#!/bin/bash

# This script creates a webhook endpoint that Jenkins can use
echo "Starting webhook listener on port 9000..."

while true; do
    echo -e "HTTP/1.1 200 OK\n\nDeployment triggered!" | nc -l -p 9000 -q 1
    echo "Webhook received! Triggering deployment..."
    ./deploy.sh
done
