---
name: hermes-channel-integration
category: messaging
description: Guide for integrating custom messaging platforms into Hermes Agent gateway — two approaches (Telegram API compatibility layer vs native adapter), architecture patterns, and implementation steps.
---

# Hermes Channel Integration Guide

Use this skill when you need to add a new messaging platform/channel to Hermes Agent's gateway system.

## Two Integration Approaches

### Approach 1: Telegram API Compatibility Layer (Recommended)

**When to use**: You have a custom chat tool and want minimal code changes to Hermes.

**Core idea**: Implement a Telegram Bot API-compatible HTTP service. Hermes' existing Telegram adapter connects to it via `base_url` config.

#### Configuration

Add to `~/.hermes/config.yaml`:

```yaml
platforms:
  telegram:
    enabled: true
    token: "your-bot-token"  # Can be any string for custom services
    extra:
      base_url: "http://localhost:8080/bot"  # Your service endpoint
      base_file_url: "http://localhost:8080/files"  # Optional file download URL
    home_channel:
      platform: telegram
      chat_id: "your-chat-id"
      name: "Home"
```

#### Required Telegram Bot API Endpoints

| Endpoint | Method | Hermes Usage |
|----------|--------|--------------|
| `getMe` | GET | Startup — get bot info |
| `getUpdates` | GET | Long-polling for messages |
| `sendMessage` | POST | Send text messages |
| `sendPhoto` | POST | Send images |
| `sendVideo` | POST | Send videos (optional) |
| `sendAudio` / `sendVoice` | POST | Send audio (optional) |
| `sendDocument` | POST | Send files (optional) |
| `deleteWebhook` | POST | Startup — clear webhook |
| `setMyCommands` | POST | Set command menu (optional) |

#### Minimal Implementation Example (FastAPI)

```python
from fastapi import FastAPI
import asyncio

app = FastAPI()
update_queue = asyncio.Queue()

@app.get("/bot{token}/getMe")
async def get_me(token: str):
    return {
        "ok": True,
        "result": {
            "id": 123456,
            "is_bot": True,
            "first_name": "YourBot",
            "username": "your_bot"
        }
    }

@app.get("/bot{token}/getUpdates")
async def get_updates(token: str, offset: int = 0, timeout: int = 30):
    updates = await get_pending_updates(offset, timeout)
    return {"ok": True, "result": updates}

@app.post("/bot{token}/sendMessage")
async def send_message(token: str, payload: dict):
    chat_id = payload["chat_id"]
    text = payload["text"]
    await your_chat_tool.send_message(chat_id, text)
    return {
        "ok": True,
        "result": {
            "message_id": generate_id(),
            "chat": {"id": chat_id},
            "text": text
        }
    }
```

#### Advantages

- Zero modifications to Hermes codebase
- Independent service — can be reused by other projects
- Fast validation — test connection immediately
- Hermes already supports this via `extra.base_url`

---

### Approach 2: Native Hermes Adapter

**When to use**: You need deep integration, custom features, or the platform doesn't fit Telegram API model.

#### Required Interface

Create `gateway/platforms/your_platform.py`:

```python
from gateway.platforms.base import BasePlatformAdapter, MessageEvent, SendResult
from gateway.config import Platform, PlatformConfig

class YourPlatformAdapter(BasePlatformAdapter):
    
    async def connect(self) -> bool:
        """Connect to platform, start receiving messages."""
        # Implement connection logic
        self._mark_connected()
        return True
    
    async def disconnect(self) -> None:
        """Disconnect from platform."""
        self._mark_disconnected()
    
    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SendResult:
        """Send message to chat."""
        # Implement send logic
        return SendResult(success=True, message_id=msg_id)
```

#### Registration Steps

1. **Add Platform Enum** in `gateway/config.py`:
   ```python
   class Platform(Enum):
       YOUR_PLATFORM = "your_platform"
   ```

2. **Register Adapter** in `gateway/run.py`:
   ```python
   from gateway.platforms.your_platform import YourPlatformAdapter
   
   ADAPTERS = {
       Platform.TELEGRAM: TelegramAdapter,
       Platform.YOUR_PLATFORM: YourPlatformAdapter,
   }
   ```

3. **Configure** in `~/.hermes/config.yaml`:
   ```yaml
   platforms:
     your_platform:
       enabled: true
       token: "your-api-key"
       extra:
         custom_setting: "value"
   ```

#### Message Event Structure

```python
@dataclass
class MessageEvent:
    chat_id: str
    sender_id: str
    content: str
    message_type: MessageType  # TEXT, IMAGE, AUDIO, etc.
    message_id: str
    timestamp: datetime
    attachments: List[Attachment]
    thread_id: Optional[str]
    metadata: Dict[str, Any]
```

---

## Architecture Reference

### Key Files

| File | Purpose |
|------|---------|
| `gateway/platforms/base.py` | Base adapter interface |
| `gateway/platforms/telegram.py` | Reference implementation |
| `gateway/config.py` | Platform enum, config classes |
| `gateway/run.py` | Adapter registration, gateway lifecycle |

### Core Methods to Implement

```python
# Required abstract methods
async def connect(self) -> bool
async def disconnect(self) -> None
async def send(self, chat_id, content, reply_to, metadata) -> SendResult

# Optional overrides
async def edit_message(self, chat_id, message_id, content) -> SendResult
async def send_typing(self, chat_id, metadata) -> None
```

### Lifecycle Hooks

```python
async def on_processing_start(self, event: MessageEvent) -> None
async def on_processing_complete(self, event: MessageEvent, response: str) -> None
async def on_processing_error(self, event: MessageEvent, error: str) -> None
```

---

## Comparison Table

| Dimension | Telegram API Layer | Native Adapter |
|-----------|-------------------|----------------|
| Development effort | Low | Medium |
| Hermes code changes | None | Required |
| Flexibility | Medium (Telegram API limits) | High |
| Maintenance | Low (independent service) | Medium (follow Hermes updates) |
| Recommended for | Custom chat tools, quick integration | New platforms, deep features |

---

## Pitfalls

1. **base_url must end with `/bot`** — Telegram adapter appends the token to this URL
2. **Long-polling timeout** — `getUpdates` should wait up to 30-50 seconds before returning empty
3. **Message ID uniqueness** — Your service must generate unique, increasing message IDs
4. **Token lock** — Hermes uses `acquire_scoped_lock()` to prevent multiple instances polling same token
5. **UTF-16 message length** — Telegram counts length in UTF-16 code units, not characters

---

## Testing Checklist

- [ ] `getMe` returns valid bot info
- [ ] `getUpdates` long-polls correctly (doesn't spin)
- [ ] `sendMessage` returns valid message object with `message_id`
- [ ] Hermes can send and receive messages bidirectionally
- [ ] Error responses follow Telegram API format (`{"ok": false, "error_code": N, "description": "..."}`)

---

## Related Skills

- `messaging/wechat-weixin-channel` — WeChat integration specifics
- `telegram-task-workflow` — Telegram task execution patterns