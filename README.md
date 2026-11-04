# NexusGate AI — Unified Cloud AI Gateway

NexusGate AI is a production-grade, cloud-hosted Unified AI Gateway and personal LLM routing infrastructure inspired by OmniRoute. It connects multiple AI providers (Anthropic, Google Gemini, OpenAI, DeepSeek, Groq, OpenRouter, Mistral, xAI, and custom HTTP endpoints), combines them into failover and load-balanced routing groups, and exposes unified APIs natively compatible with **Claude Code** and standard OpenAI clients.

---

## 🌟 Key Features

1. **Anthropic Messages API Compatibility (`POST /v1/messages`)**:
   - First-class support for **Claude Code** CLI and Anthropic clients.
   - Real-time Server-Sent Events (SSE) streaming (`message_start`, `content_block_start`, `content_block_delta`, `message_delta`, `message_stop`).
   - Bidirectional protocol translation: Use any provider (Gemini, DeepSeek, Groq, OpenAI) with Claude Code.
   - Tool calling and schema translation (`input_schema` ↔ OpenAI function schema).
   - Multi-turn conversation context preservation.
   - Automated **10-Point Claude Code Compatibility Test Suite** with real-time pass/fail status.

2. **OpenAI API Compatibility (`POST /v1/chat/completions`, `POST /v1/responses`, `GET /v1/models`)**:
   - Works out-of-the-box with Cursor, Aider, LangChain, and standard OpenAI SDKs.
   - Streaming and non-streaming support.

3. **Advanced Routing Engine**:
   - **Combo Routing**:
     - *Sequential Failover*: Tries primary provider; seamlessly falls back (e.g. Anthropic Sonnet → Gemini 2.5 Pro → DeepSeek Chat) on 429 rate limit or 5xx outage before streaming commences.
     - *Parallel Race*: Concurrent multi-provider race returning lowest-latency eligible response.
     - *Weighted Load Balancing*: Distributes traffic (e.g. 60% Groq / 40% Gemini Flash) with circuit-breaker auto-exclusion.
     - *Priority Routing*: Tiered execution.
   - **Auto Task-Based Routing**: Heuristic and rule-based classification (coding, fast queries, complex reasoning, vision).
   - **Manual Routing**: Direct provider and model selection.

4. **Dynamic Model Aliases**:
   - Custom aliases (e.g., `my-fast`, `my-coding`, `my-reasoning`, `my-vision`, `my-best`).
   - Claude Code environment mappings (`claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`).

5. **Bank-Grade Security & Guardrails**:
   - **Zero-Knowledge API Keys**: Gateway keys (`gw-live-...`) are hashed using SHA-256; only hashes are stored, and raw tokens are revealed only once at creation.
   - **Authenticated Encryption**: 3rd-party provider secrets are encrypted server-side with AES-256-GCM before database storage.
   - **SSRF Protection**: Blocks loopback (`127.0.0.1`, `localhost`), internal private network ranges, and cloud metadata IPs (`169.254.169.254`).
   - **Emergency Kill Switch**: Instantly pauses all outgoing AI provider calls from the UI or API.
   - **Spending Limits**: Enforce daily request caps and monthly budget ceilings ($ USD).

6. **Interactive Developer Experience**:
   - **Live Sandbox / Playground**: Test prompts, inspect streaming tokens, and view latency breakdown directly in the dashboard.
   - **Full Trace Logs**: View hops, retry attempts, and failover reasons for every request.
   - **CSV Analytics Export**: Download timeline usage data.
   - **Configuration Backup**: Export and import complete non-secret JSON configurations.

---

## ⚡ Quick Start: Claude Code Configuration

To point Claude Code to your NexusGate AI Gateway, set the following environment variables in your terminal:

```bash
# Point Claude Code to NexusGate
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_AUTH_TOKEN="gw-live-master-key-prod-001"

# Model routing aliases
export ANTHROPIC_DEFAULT_SONNET_MODEL="combo-prod-coding"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-3-7-sonnet"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-3-5-haiku"
```

Now launch Claude Code:
```bash
claude
```

---

## 🚀 Running the Gateway

```bash
# Run full-stack dev server (port 3000)
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

---

## 🛡️ Cloud Deployment & Environment Variables

Deploy to Vercel or any container environment with the following environment variables:

| Variable | Description |
|---|---|
| `GATEWAY_ENCRYPTION_SECRET` | 32-byte secret used for AES-256-GCM encryption of provider keys |
| `GEMINI_API_KEY` | Google Gemini API key (optional default provider) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `GROQ_API_KEY` | Groq API key |
