# VPS 部署 Nostr Relay（strfry + Nginx + WSS）

本文档配套 `docker/docker-compose.relay.yml` 使用，目标：在 VPS 上跑一个 strfry relay，
通过 Nginx 以 `wss://relay.example.com` 对外提供（TLS 由 Nginx 终结）。

```
浏览器/APP  ──wss(443)──▶  Nginx  ──ws(127.0.0.1:7777)──▶  strfry 容器
```

## 0. 先纠正一个关键点：127.0.0.1 绑定在 VPS 上是对的

`docker/docker-compose.test.yml` 里的 `127.0.0.1:7778:7777` 不是「只能本地用」，
而是「只监听本机回环」。只要 **Nginx 和 Docker 在同一台 VPS**，这正是你要的：

- relay 端口不对公网开放，任何人无法绕过 Nginx 直连（无 TLS、无访问控制）；
- 外部唯一入口是 Nginx 的 443（WSS）。

所以生产 compose 默认保持 `127.0.0.1` 绑定。**不要**改成 `0.0.0.0`，除非
Nginx 不在这台机器上（此时用 `RELAY_BIND=0.0.0.0` 启动，并立刻用防火墙把
7777 限制为仅 Nginx 来源 IP 可访问）。

## 1. 准备

```bash
# 安装 Docker（Ubuntu/Debian 一键脚本）
curl -fsSL https://get.docker.com | sh

# 拿到代码（compose 文件按相对路径挂载 docker/strfry.conf，需在仓库根目录运行）
git clone https://github.com/finger-fan/dodo-box.git
cd dodo-box
```

DNS：把 `relay.example.com` 的 A 记录指向 VPS 公网 IP。

## 2. 启动 relay

```bash
docker compose -f docker/docker-compose.relay.yml up -d
docker compose -f docker/docker-compose.relay.yml ps        # 应显示 healthy
```

数据持久化在 `relay-data` volume，`docker compose ... down` 不丢数据
（`down -v` 才会删除，慎用）。

## 3. TLS 证书（certbot）

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d relay.example.com
```

certbot 会自动改 Nginx 配置加上 443/ssl，但 **WebSocket 相关配置要手动加**（见下一步）。

## 4. Nginx 配置（WSS 关键所在）

你的直觉没错：WebSocket 是靠 HTTP `Upgrade` 头「升级」出来的，Nginx 默认不会
转发这个头，必须显式配置。编辑 `/etc/nginx/sites-available/default`
（或 certbot 生成的站点配置）：

```nginx
server {
    listen 443 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7777;

        # ── WebSocket 必需的三行 ──
        proxy_http_version 1.1;                      # WS 要求 HTTP/1.1
        proxy_set_header Upgrade $http_upgrade;      # 转发 Upgrade 头
        proxy_set_header Connection "upgrade";       # 转发 Connection 头

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 是长连接：默认 60s 无数据 Nginx 就会切断，
        # Nostr 订阅是常驻连接，必须调大
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

注意：**不要**给这个 location 加 `proxy_buffering` 之类的响应缓存，WS 是双向流。

```bash
nginx -t && systemctl reload nginx
```

## 5. 验证

```bash
# NIP-11 relay 信息（strfry 的 WS 端口同时应答普通 HTTP）
curl -s -H "Accept: application/nostr+json" https://relay.example.com/

# WSS 连通性（装了 wscat 的话：npm i -g wscat）
wscat -c wss://relay.example.com
# 连上后发送一条 NIP-01 订阅，应收到 EOSE：
# ["REQ","test",{"kinds":[3],"limit":1}]
```

## 6. 让客户端用上这个 relay

按你使用的端选一个（`docs/deployment.md` 第 4 节有完整优先级说明）：

| 端 | 配置方式 |
|----|----------|
| Docker 部署的 Web | `docker-compose.yml` 里 app 的 `DEFAULT_RELAYS=wss://relay.example.com`（运行时下发，无需重建镜像） |
| 本地 dev | `.env.local`：`NEXT_PUBLIC_DEFAULT_RELAYS=wss://relay.example.com` |
| APK 构建 | `.env.release`：`NEXT_PUBLIC_DEFAULT_RELAYS=wss://relay.example.com`（构建期内联） |
| CLI | `~/.dodobox/config.json` 的 `relays` / `defaultRelays` |
| 任何端 | 已登录用户在「设置 → Relays」手动填（写 localStorage，优先级最高） |

## 7. 防火墙 / 云安全组

只需放行 **80、443**。7777 绑在回环上，不需要也不应该对外开放。
（certbot 申请/续期证书需要 80 端口可达。）

## 8. 日常运维

```bash
# 日志（按 AGENTS.md 规则：排查问题先看日志）
docker compose -f docker/docker-compose.relay.yml logs -f relay

# 重启 / 停止
docker compose -f docker/docker-compose.relay.yml restart
docker compose -f docker/docker-compose.relay.yml down

# 备份事件数据（LMDB，建议先停容器再拷贝，或用 strfry export）
docker run --rm -v dodo-box_relay-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/relay-data-$(date +%F).tar.gz -C /data .
```

## 9. 可选：让 strfry 看到真实客户端 IP

`docker/strfry.conf` 里 `realIpHeader = ""`。经过 Nginx 反代后，strfry 看到的
来源全是 `127.0.0.1`。如果以后要启用按 IP 限流（`maxIpsPerRequest`），把它改成
`"X-Forwarded-For"` 即可（上面的 Nginx 配置已经转发该头）。当前限流为 0（不限），
不改也能正常跑。
