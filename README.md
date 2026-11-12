# MSRoute — Personal AI Gateway

MSRoute is a self-hosted AI gateway for routing requests across multiple model providers through familiar API interfaces. It provides a single place to manage provider connections, choose models, configure routing strategies, and inspect request activity.

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

## Getting started

### Requirements

- Node.js and npm
- API credentials for the AI providers you plan to use

### Install and run locally

```bash
npm install
npm run dev
```

The development server starts the application locally. Configure provider credentials and gateway settings through the application before sending requests.

### Available commands

```bash
npm run dev    # Start the local development server
npm test       # Run the test suite
npm run lint   # Check TypeScript types
npm run build  # Build the frontend
```

## Using with Claude Code

MSRoute exposes an Anthropic-compatible Messages API. After starting the gateway and creating a gateway key, configure Claude Code to use your local MSRoute instance:

```bash
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_AUTH_TOKEN="<your-gateway-key>"
claude
```

Use a gateway key created in your own MSRoute instance; do not commit real credentials to source control.

## Supported providers

MSRoute is designed to work with Anthropic, Google Gemini, OpenAI, DeepSeek, and Groq. Provider availability depends on the credentials and models configured in your instance.

## Technology

Built with TypeScript, React, Vite, and Express.
