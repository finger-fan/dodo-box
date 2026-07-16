#!/bin/bash
# test-local-relay.sh - 一键启动本地 relay 双用户测试
# 执行方式: ./scripts/test-local-relay.sh

set -e

PROJECT_ROOT="/Users/david/_projects/2_personal/projects/dodo-box"
CONFIG_DIR="$HOME/.dodobox"

echo "=========================================="
echo "🦆 DodoBox 本地 Relay 双用户测试"
echo "=========================================="

# 1. 启动 relay
echo "[1/3] 启动本地 relay..."
cd "$PROJECT_ROOT"
docker compose up -d relay 2>/dev/null || {
    echo "❌ Docker 启动失败，请确保 Docker Desktop 已运行"
    exit 1
}

sleep 2
for i in {1..10}; do
    if curl -s http://localhost:7777 > /dev/null 2>&1; then
        echo "✅ Relay 已就绪: ws://localhost:7777"
        break
    fi
    [ $i -eq 10 ] && { echo "❌ Relay 启动超时"; exit 1; }
    sleep 1
done

# 2. 清除旧配置（加密方式已修改）
echo "[2/3] 重置配置..."
rm -rf "$CONFIG_DIR"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" << 'EOF'
{
  "relays": ["ws://localhost:7777"],
  "defaultRelays": ["ws://localhost:7777"],
  "autoReconnect": true,
  "maxRetries": 3
}
EOF
echo "✅ 配置已重置"

# 3. 打开测试终端
echo "[3/3] 启动测试终端..."

osascript << 'APPLESCRIPT'
tell application "Terminal"
    activate

    -- Bob 终端
    set bobTab to do script "cd /Users/david/_projects/2_personal/projects/dodo-box && echo '🦆 Bob - Username: bob, Password: bbbb' && echo '' && pnpm cli"
    set custom title of bobTab to "Bob"

    delay 0.3

    -- David 终端
    set davidTab to do script "cd /Users/david/_projects/2_personal/projects/dodo-box && echo '🦆 David - Username: david, Password: dddd' && echo '' && pnpm cli"
    set custom title of davidTab to "David"
end tell
APPLESCRIPT

echo ""
echo "=========================================="
echo "✅ 测试环境已启动"
echo ""
echo "测试用户: david:dddd, bob:bbbb"
echo ""
echo "步骤:"
echo "  1. 在 Bob 终端登录后复制 pubkey"
echo "  2. 在 David 终端: /add <bob的pubkey> bob"
echo "  3. /select bob"
echo "  4. 输入消息"
echo "=========================================="