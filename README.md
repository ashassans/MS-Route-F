# MSRoute — Personal AI Gateway

MSRoute is an AI gateway for routing requests across multiple model providers through familiar API interfaces. It provides a single place to manage provider connections, choose models, configure routing strategies, and inspect request activity.

**Live app:** [msroute.hassns.workers.dev](https://msroute.hassns.workers.dev)

## Features

### API compatibility

- Anthropic Messages API support (`POST /v1/messages`), including streaming responses and tool calls.
- OpenAI-compatible endpoints, including Chat Completions, Responses, and model listing.
- Use supported providers with clients built for the Anthropic or OpenAI APIs.

### Flexible model routing

- Select a provider and model directly, or use configurable model aliases.
- Configure routing strategies such as sequential failover, parallel selection, weighted distribution, and priority-based routing.
- Route requests using task-oriented rules for workloads such as coding, reasoning, and vision.
- Fall back to eligible providers when a request encounters rate limits or service errors.

### Security and controls

- Store gateway credentials as hashes and encrypt provider credentials before database storage.
- Apply request limits and monthly spending ceilings.
- Pause outgoing provider requests with the emergency kill switch.
- Validate custom provider endpoints to help prevent requests to private or internal network addresses.

### Monitoring and configuration

- Use the dashboard playground to test prompts and inspect streamed responses.
- Review request traces, routing hops, retries, and failover details.
- Export usage analytics as CSV.
- Back up and restore non-secret configuration as JSON.

## Using with Claude Code

MSRoute exposes an Anthropic-compatible Messages API. Configure Claude Code to use the live gateway and a gateway key created in your MSRoute account:

```bash
export ANTHROPIC_BASE_URL="https://msroute.hassns.workers.dev"
export ANTHROPIC_AUTH_TOKEN="<your-gateway-key>"
claude
```

Do not commit real credentials to source control.

## Using the OpenAI-compatible API

Use your MSRoute gateway key as the API key and a model name or alias configured in your account.

### cURL

```bash
curl https://msroute.hassns.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <your-gateway-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<your-model-or-alias>",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Python with the OpenAI SDK

```bash
pip install openai
```

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["MSROUTE_API_KEY"],
    base_url="https://msroute.hassns.workers.dev/v1",
)

response = client.chat.completions.create(
    model="<your-model-or-alias>",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)
```

Set `MSROUTE_API_KEY` to your gateway key before running the Python example. Do not commit real credentials to source control.

## Supported providers

MSRoute is designed to work with Anthropic, Google Gemini, OpenAI, DeepSeek, and Groq. Provider availability depends on the credentials and models configured in your account.

## Technology

Built with TypeScript, React, Vite, and Express.
