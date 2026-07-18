#!/bin/bash
# Auto-start local relay and create test users
# This script should be run on macOS host

set -e

cd /Users/david/_projects/2_personal/projects/dodo-box

# 1. Start relay
echo "Starting local relay..."
docker compose -f docker/docker-compose.yml up -d relay

# Wait for relay
sleep 3
for i in {1..10}; do
    if curl -s http://localhost:7777 > /dev/null 2>&1; then
        echo "Relay ready"
        break
    fi
    sleep 1
done

# 2. Clear old config
rm -rf ~/.dodobox
mkdir -p ~/.dodobox

# 3. Write local relay config
cat > ~/.dodobox/config.json << 'EOF'
{
  "relays": ["ws://localhost:7777"],
  "defaultRelays": ["ws://localhost:7777"],
  "autoReconnect": true,
  "maxRetries": 3
}
EOF

echo "Config ready. Starting terminals..."