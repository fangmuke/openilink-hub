# OpeniLink Hub — App Development Guide

> This document is for developers building Apps that integrate with OpeniLink Hub (a WeChat bot management platform). The App system follows a Slack-like model: your App is an external service that communicates with the platform via HTTP.

## Architecture

```
WeChat ←→ OpeniLink Hub (Platform) ←→ Your App (External Service)
```

Two communication directions:

1. **Platform → App**: Platform POSTs events (messages, commands) to your App's Request URL
2. **App → Platform**: Your App calls the Bot API with an `app_token` to send messages, read contacts, etc.

## Quick Start

### 1. Create an App

In the OpeniLink Hub dashboard → Apps → Create App:
- **Name**: Display name (e.g. "GitHub Integration")
- **Slug**: Unique identifier (e.g. `github`, lowercase alphanumeric + hyphens)
- **Commands**: Slash commands your App handles (e.g. `/github`)
- **Events**: Event types your App subscribes to (e.g. `message.text`)
- **Scopes**: Permissions your App needs (e.g. `messages.send`)

### 2. Install to a Bot

Install your App to a Bot. You'll receive:
- **`app_token`**: Bearer token for calling the Bot API
- **`signing_secret`**: Used to verify that events come from the platform

### 3. Set Request URL

Configure your App's HTTP endpoint. The platform will verify it with a challenge:

```json
POST {your_request_url}
{"v": 1, "type": "url_verification", "challenge": "random_string"}
```

Your server must respond:
```json
{"challenge": "random_string"}
```

### 4. Handle Events

Once verified, the platform will POST events to your Request URL.

## Event Delivery (Platform → App)

### Event Envelope

All events share this envelope format:

```json
{
  "v": 1,
  "type": "event_callback",
  "trace_id": "tr_abc123",
  "installation_id": "inst_xxx",
  "bot": {
    "id": "bot_xxx"
  },
  "event": {
    "type": "message.text",
    "id": "evt_xxx",
    "timestamp": 1711234567,
    "data": { ... }
  }
}
```

### Message Events

When a WeChat message matches your App's subscription:

```json
{
  "v": 1,
  "type": "event_callback",
  "trace_id": "tr_abc123",
  "installation_id": "inst_xxx",
  "bot": {"id": "bot_xxx"},
  "event": {
    "type": "message.text",
    "id": "evt_xxx",
    "timestamp": 1711234567,
    "data": {
      "message_id": 12345,
      "sender": {
        "id": "wxid_abc",
        "name": "Zhang San"
      },
      "group": null,
      "content": "hello",
      "msg_type": "text",
      "items": []
    }
  }
}
```

Group messages include `group`:
```json
"group": {
  "id": "group_xxx",
  "name": "Tech Team"
}
```

### Command Events

When a user sends `/your_command args`:

```json
{
  "v": 1,
  "type": "command",
  "trace_id": "tr_abc123",
  "installation_id": "inst_xxx",
  "bot": {"id": "bot_xxx"},
  "event": {
    "type": "command",
    "id": "evt_xxx",
    "timestamp": 1711234567,
    "data": {
      "command": "/github",
      "text": "list PRs",
      "sender": {
        "id": "wxid_abc",
        "name": "Zhang San"
      },
      "group": null
    }
  }
}
```

Commands can also be triggered via `@handle args` if a handle is configured on the installation.

### Synchronous Reply

Your App can reply directly in the HTTP response:

```json
HTTP 200
{"reply": "Here are the open PRs:\n1. fix bug\n2. add feature"}
```

For media replies (future):
```json
{"reply": "...", "reply_type": "image", "reply_url": "https://..."}
```

### Event Types

| Event Type | Trigger |
|---|---|
| `message` | Any WeChat message (wildcard) |
| `message.text` | Text message |
| `message.image` | Image message |
| `message.voice` | Voice message |
| `message.video` | Video message |
| `message.file` | File message |

### Request Signing

Every event POST includes these headers:

| Header | Description |
|---|---|
| `X-App-Id` | Your App's ID |
| `X-Installation-Id` | Installation instance ID |
| `X-Timestamp` | Unix timestamp (seconds) |
| `X-Signature` | `sha256={HMAC-SHA256 hex digest}` |
| `X-Trace-Id` | Trace ID for debugging |
| `Content-Type` | `application/json` |

**Verification algorithm**:
```
expected = HMAC-SHA256(signing_secret, "{timestamp}:{request_body}")
```

Verify:
1. `X-Timestamp` is within 5 minutes of current time
2. Computed signature matches `X-Signature` (after removing `sha256=` prefix)

### Retry Policy

| Attempt | Delay | Condition |
|---|---|---|
| 1 | Immediate | No response or non-2xx |
| 2 | 10 seconds | Same |
| 3 | 60 seconds | Same |

Your App must respond with HTTP 2xx within **3 seconds**. If processing takes longer, respond immediately with 200 and process asynchronously.

## Bot API (App → Platform)

Your App calls these endpoints to interact with the Bot.

**Base URL**: `{hub_origin}/bot/v1`

**Authentication**: `Authorization: Bearer {app_token}`

**Optional headers**:
- `X-Trace-Id`: Your trace ID (links to event trace for debugging)

### Send Message

```
POST /bot/v1/messages/send
Authorization: Bearer {app_token}

{
  "to": "wxid_xxx",
  "type": "text",
  "content": "New PR: fix login bug #123",
  "trace_id": "tr_xxx"
}
```

Response:
```json
{"ok": true, "client_id": "msg_xxx", "trace_id": "tr_xxx"}
```

| Field | Required | Description |
|---|---|---|
| `to` | Yes | Recipient WeChat ID or group ID |
| `type` | No | Message type: `text` (default), `image`, `file` |
| `content` | Yes | Message content |
| `trace_id` | No | Optional trace ID for correlation |

For image/file messages (future):
```json
{"to": "wxid_xxx", "type": "image", "url": "https://example.com/img.png"}
{"to": "wxid_xxx", "type": "file", "url": "https://example.com/report.pdf", "filename": "report.pdf"}
```

### List Contacts

```
GET /bot/v1/contacts
Authorization: Bearer {app_token}
```

Response:
```json
{
  "ok": true,
  "contacts": [
    {"user_id": "wxid_abc", "display_name": "Zhang San", "last_seen": 1711234567},
    ...
  ]
}
```

**Required scope**: `contacts.read`

### Get Bot Info

```
GET /bot/v1/bot
Authorization: Bearer {app_token}
```

Response:
```json
{
  "ok": true,
  "bot": {
    "id": "bot_xxx",
    "name": "My Bot",
    "provider": "wechat",
    "status": "connected",
    "msg_count": 1234,
    "created_at": 1711234567,
    "updated_at": 1711234567
  }
}
```

**Required scope**: `bot.read`

### Error Responses

```json
{"ok": false, "error": "error message"}
```

| Status | Meaning |
|---|---|
| 401 | Invalid or missing app_token |
| 403 | Missing required scope |
| 400 | Invalid request body |
| 404 | Bot or resource not found |
| 502 | Bot send failed |
| 503 | Bot not connected or session expired |

## Scopes

| Scope | Capability |
|---|---|
| `messages.send` | Send messages via the Bot |
| `contacts.read` | Read the Bot's contact list |
| `bot.read` | Read Bot info (name, status, etc.) |

Declare only the scopes your App needs. Users see the requested scopes when installing.

## Full Example: GitHub Notification Bot

A complete App that:
- Receives `/github subscribe owner/repo` commands from WeChat
- Receives GitHub webhook events and notifies WeChat

### 1. App Configuration

```
Name: GitHub Bot
Slug: github-bot
Commands: [{"name": "/github", "description": "GitHub commands", "usage": "/github subscribe owner/repo"}]
Events: ["message.text"]
Scopes: ["messages.send", "contacts.read"]
```

### 2. Server (Python example)

```python
import hmac, hashlib, json, time
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

SIGNING_SECRET = "your_signing_secret"
APP_TOKEN = "app_xxx"
HUB_URL = "https://your-hub.example.com"

def verify_signature(req):
    timestamp = req.headers.get("X-Timestamp", "")
    signature = req.headers.get("X-Signature", "").removeprefix("sha256=")
    if abs(time.time() - int(timestamp)) > 300:
        return False
    body = req.get_data()
    expected = hmac.new(
        SIGNING_SECRET.encode(), f"{timestamp}:".encode() + body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# Handle events from OpeniLink Hub
@app.route("/webhook", methods=["POST"])
def handle_event():
    data = request.json

    # URL verification
    if data.get("type") == "url_verification":
        return jsonify({"challenge": data["challenge"]})

    # Verify signature
    if not verify_signature(request):
        return "invalid signature", 401

    # Handle command
    if data["type"] == "command":
        cmd = data["event"]["data"]
        if cmd["command"] == "/github":
            return jsonify({"reply": f"GitHub command received: {cmd['text']}"})

    # Handle message
    if data["type"] == "event_callback":
        msg = data["event"]["data"]
        # Process message...
        pass

    return jsonify({"ok": True})

# Handle GitHub webhook events
@app.route("/github-webhook", methods=["POST"])
def handle_github():
    event = request.headers.get("X-GitHub-Event")
    data = request.json

    if event == "pull_request":
        action = data["action"]
        pr = data["pull_request"]
        text = f"PR {action}: {pr['title']}\n{pr['html_url']}"

        # Send to WeChat via Bot API
        requests.post(
            f"{HUB_URL}/bot/v1/messages/send",
            headers={"Authorization": f"Bearer {APP_TOKEN}"},
            json={"to": "group_xxx", "content": text}
        )

    return "ok"
```

### 3. Server (Go example)

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "strconv"
    "strings"
    "time"
)

const (
    signingSecret = "your_signing_secret"
    appToken      = "app_xxx"
    hubURL        = "https://your-hub.example.com"
)

func verifySignature(r *http.Request, body []byte) bool {
    ts := r.Header.Get("X-Timestamp")
    sig := strings.TrimPrefix(r.Header.Get("X-Signature"), "sha256=")
    tsInt, _ := strconv.ParseInt(ts, 10, 64)
    if abs(time.Now().Unix()-tsInt) > 300 {
        return false
    }
    mac := hmac.New(sha256.New, []byte(signingSecret))
    mac.Write([]byte(ts + ":"))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(sig))
}

func abs(n int64) int64 { if n < 0 { return -n }; return n }

func sendToWeChat(to, content string) {
    body, _ := json.Marshal(map[string]string{"to": to, "content": content})
    req, _ := http.NewRequest("POST", hubURL+"/bot/v1/messages/send", strings.NewReader(string(body)))
    req.Header.Set("Authorization", "Bearer "+appToken)
    req.Header.Set("Content-Type", "application/json")
    http.DefaultClient.Do(req)
}

func handleEvent(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    var envelope map[string]any
    json.Unmarshal(body, &envelope)

    // URL verification
    if envelope["type"] == "url_verification" {
        json.NewEncoder(w).Encode(map[string]string{
            "challenge": envelope["challenge"].(string),
        })
        return
    }

    // Verify signature
    if !verifySignature(r, body) {
        http.Error(w, "invalid signature", 401)
        return
    }

    // Handle command
    if envelope["type"] == "command" {
        event := envelope["event"].(map[string]any)
        data := event["data"].(map[string]any)
        json.NewEncoder(w).Encode(map[string]string{
            "reply": fmt.Sprintf("GitHub command: %s", data["text"]),
        })
        return
    }

    w.Write([]byte(`{"ok":true}`))
}

func handleGitHub(w http.ResponseWriter, r *http.Request) {
    event := r.Header.Get("X-GitHub-Event")
    var data map[string]any
    json.NewDecoder(r.Body).Decode(&data)

    if event == "pull_request" {
        pr := data["pull_request"].(map[string]any)
        text := fmt.Sprintf("PR %s: %s\n%s",
            data["action"], pr["title"], pr["html_url"])
        sendToWeChat("group_xxx", text)
    }

    w.Write([]byte("ok"))
}

func main() {
    http.HandleFunc("/webhook", handleEvent)
    http.HandleFunc("/github-webhook", handleGitHub)
    http.ListenAndServe(":8080", nil)
}
```

## API Endpoints Summary

### Dashboard API (User Management)

| Method | Path | Description |
|---|---|---|
| POST | `/api/apps` | Create App |
| GET | `/api/apps` | List my Apps |
| GET | `/api/apps/{id}` | Get App detail |
| PUT | `/api/apps/{id}` | Update App |
| DELETE | `/api/apps/{id}` | Delete App |
| POST | `/api/apps/{id}/install` | Install to Bot |
| GET | `/api/apps/{id}/installations` | List installations |
| GET | `/api/apps/{id}/installations/{iid}` | Installation detail |
| PUT | `/api/apps/{id}/installations/{iid}` | Update installation |
| DELETE | `/api/apps/{id}/installations/{iid}` | Uninstall |
| POST | `/api/apps/{id}/installations/{iid}/regenerate-token` | Regenerate token |
| POST | `/api/apps/{id}/installations/{iid}/verify-url` | Verify request URL |
| GET | `/api/apps/{id}/installations/{iid}/event-logs` | Event delivery logs |
| GET | `/api/apps/{id}/installations/{iid}/api-logs` | API call logs |

### Bot API (App Calls)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/bot/v1/messages/send` | `messages.send` | Send message |
| GET | `/bot/v1/contacts` | `contacts.read` | List contacts |
| GET | `/bot/v1/bot` | `bot.read` | Get bot info |

## Tips for AI Agents

When building an App:

1. Always handle URL verification (`"type": "url_verification"`) first
2. Verify the `X-Signature` on every event to ensure it comes from the platform
3. Respond to events within 3 seconds — process asynchronously if needed
4. Use `trace_id` from events when calling the Bot API for end-to-end tracing
5. Declare minimum required scopes
6. Handle retry gracefully — use `event.id` for deduplication
7. Commands are triggered by `/command` or `@handle` in WeChat messages
8. The `to` field in send message must be a valid WeChat contact ID on the Bot
