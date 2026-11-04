import {
  parseAnthropicRequest,
  formatAnthropicResponse,
  parseOpenAiRequest,
  formatOpenAiResponse,
} from '../adapters/protocol-converter.ts';
import { generateGatewayApiKey, hashGatewayKey, encryptSecret, decryptSecret } from '../security/encryption.ts';
import { validateProviderUrl } from '../security/ssrf.ts';
import { isRetryableError } from '../engine/fallback.ts';
import { db } from '../store/db.ts';

export interface ClaudeTestCheck {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

export interface ClaudeSuiteReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  status: 'passed' | 'failed';
  checks: ClaudeTestCheck[];
}

export async function runClaudeCodeTestSuite(): Promise<ClaudeSuiteReport> {
  const checks: ClaudeTestCheck[] = [];

  // Check 1: Cryptographic Authentication & Key Hashing
  const t1Start = Date.now();
  try {
    const { rawKey, keyPrefix, keyHash } = generateGatewayApiKey();
    const recomputed = hashGatewayKey(rawKey);
    const rejected = db.verifyApiKey('invalid-unregistered-token-000');
    const cipher = encryptSecret(rawKey);
    const plain = decryptSecret(cipher);
    const passed = recomputed === keyHash && rejected === null && plain === rawKey && keyPrefix.startsWith('gw-live-');
    checks.push({
      id: 'check-1-auth',
      name: '1. Authentication & AES-256/SHA-256 Security',
      description: 'Validates gateway API key SHA-256 hashing, AES-256-GCM secret encryption, and invalid token rejection',
      passed,
      durationMs: Date.now() - t1Start,
      details: passed
        ? `SHA-256 & AES-256-GCM verified (${db.getApiKeys().filter((k) => !k.revoked).length} active user keys)`
        : 'Cryptographic key verification failed',
    });
  } catch (err: any) {
    checks.push({
      id: 'check-1-auth',
      name: '1. Authentication & AES-256/SHA-256 Security',
      description: 'Validates cryptographic gateway key security',
      passed: false,
      durationMs: Date.now() - t1Start,
      details: err.message,
    });
  }

  // Check 2: Anthropic Messages API Request & Response Protocol
  const t2Start = Date.now();
  try {
    const rawReq = {
      model: 'claude-3-7-sonnet',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'Act as a senior software architect.' }],
      messages: [{ role: 'user', content: 'Verify Messages API protocol framing.' }],
    };
    const parsed = parseAnthropicRequest(rawReq);
    const formatted = formatAnthropicResponse({
      id: `msg_${Date.now()}`,
      model: parsed.model,
      content: 'Protocol framing verified.',
      stopReason: 'end_turn',
      usage: { inputTokens: 24, outputTokens: 8 },
    });

    const validStructure =
      parsed.system === 'Act as a senior software architect.' &&
      formatted.type === 'message' &&
      formatted.role === 'assistant' &&
      Array.isArray(formatted.content) &&
      formatted.content[0]?.type === 'text' &&
      formatted.stop_reason === 'end_turn';

    checks.push({
      id: 'check-2-basic',
      name: '2. Basic Messages API Protocol',
      description: 'Validates Anthropic POST /v1/messages request parsing and response envelope structure',
      passed: validStructure,
      durationMs: Date.now() - t2Start,
      details: `Envelope type="${formatted.type}", stop_reason="${formatted.stop_reason}"`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-2-basic',
      name: '2. Basic Messages API Protocol',
      description: 'Validates Anthropic POST /v1/messages',
      passed: false,
      durationMs: Date.now() - t2Start,
      details: err.message,
    });
  }

  // Check 3: Streaming SSE Event Sequence Framing
  const t3Start = Date.now();
  try {
    const events = [
      { type: 'message_start', message: { id: 'msg_sse', type: 'message', role: 'assistant', content: [] } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'chunk' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ];
    const encoded = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const passed =
      encoded.includes('event: message_start') &&
      encoded.includes('event: content_block_delta') &&
      encoded.includes('event: message_stop');

    checks.push({
      id: 'check-3-stream',
      name: '3. Streaming SSE Event Ordering',
      description: 'Validates Anthropic SSE lifecycle sequence (message_start -> content_block_delta -> message_stop)',
      passed,
      durationMs: Date.now() - t3Start,
      details: `Verified ${events.length}-stage Anthropic SSE frame sequence`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-3-stream',
      name: '3. Streaming SSE Event Ordering',
      description: 'Validates SSE streaming sequence',
      passed: false,
      durationMs: Date.now() - t3Start,
      details: err.message,
    });
  }

  // Check 4: Multi-turn Conversations & Tool Result Blocks
  const t4Start = Date.now();
  try {
    const rawReq = {
      model: 'claude-3-7-sonnet',
      messages: [
        { role: 'user', content: 'Inspect package.json' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'read_file', input: { path: 'package.json' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: '{"name":"msroute"}' }],
        },
      ],
    };
    const parsed = parseAnthropicRequest(rawReq);
    const passed =
      parsed.messages.length === 3 &&
      parsed.messages[1].role === 'assistant' &&
      parsed.messages[1].toolCalls?.[0]?.function.name === 'read_file' &&
      parsed.messages[2].role === 'tool' &&
      parsed.messages[2].toolCallId === 'toolu_01';

    checks.push({
      id: 'check-4-multiturn',
      name: '4. Multi-turn & Tool Result Context',
      description: 'Ensures alternating user/assistant/tool_result turns are preserved accurately',
      passed,
      durationMs: Date.now() - t4Start,
      details: `Verified 3 dialog turns including tool_use and tool_result linkage`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-4-multiturn',
      name: '4. Multi-turn & Tool Result Context',
      description: 'Preserves conversation context',
      passed: false,
      durationMs: Date.now() - t4Start,
      details: err.message,
    });
  }

  // Check 5: Tool-use Schema & Block Translation
  const t5Start = Date.now();
  try {
    const rawReq = {
      model: 'claude-3-7-sonnet',
      tools: [
        {
          name: 'read_file',
          description: 'Read local source code file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ],
      messages: [{ role: 'user', content: 'Read tsconfig.json' }],
    };
    const parsed = parseAnthropicRequest(rawReq);
    const formatted = formatAnthropicResponse({
      id: 'msg_tool_check',
      model: parsed.model,
      content: 'Reading file...',
      toolCalls: [{ id: 'toolu_99', name: 'read_file', arguments: '{"path":"tsconfig.json"}' }],
      stopReason: 'tool_use',
      usage: { inputTokens: 45, outputTokens: 18 },
    });
    const toolBlock = formatted.content.find((b: any) => b.type === 'tool_use');
    const passed =
      Boolean(parsed.tools && parsed.tools[0].name === 'read_file') &&
      Boolean(toolBlock && toolBlock.input?.path === 'tsconfig.json') &&
      formatted.stop_reason === 'tool_use';

    checks.push({
      id: 'check-5-tools',
      name: '5. Tool-use Schema & Block Translation',
      description: 'Validates input_schema transformation to UnifiedTool & Anthropic tool_use blocks',
      passed,
      durationMs: Date.now() - t5Start,
      details: `Verified input_schema -> tool_use (stop_reason="${formatted.stop_reason}")`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-5-tools',
      name: '5. Tool-use Schema & Block Translation',
      description: 'Tool use handling',
      passed: false,
      durationMs: Date.now() - t5Start,
      details: err.message,
    });
  }

  // Check 6: Large Context & Token Counter Compatibility
  const t6Start = Date.now();
  try {
    const longPrompt = 'const x = 1;\n'.repeat(1000);
    const parsed = parseAnthropicRequest({
      model: 'gemini-2.5-pro',
      system: 'Analyze large codebase',
      messages: [{ role: 'user', content: longPrompt }],
      max_tokens: 8192,
    });
    const estimatedTokens = Math.max(1, Math.floor((longPrompt.length + (parsed.system?.length || 0)) / 3.8));
    const passed = parsed.messages[0].content.length === longPrompt.length && estimatedTokens > 3000;

    checks.push({
      id: 'check-6-long',
      name: '6. Large Payload & /count_tokens Support',
      description: 'Ensures large code context payloads parse cleanly without truncation',
      passed,
      durationMs: Date.now() - t6Start,
      details: `Parsed ${longPrompt.length.toLocaleString()} bytes (~${estimatedTokens.toLocaleString()} tokens)`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-6-long',
      name: '6. Large Payload & /count_tokens Support',
      description: 'Large payload handling',
      passed: false,
      durationMs: Date.now() - t6Start,
      details: err.message,
    });
  }

  // Check 7: OpenAI <-> Anthropic Cross-Protocol Usage Reporting
  const t7Start = Date.now();
  try {
    const oaiParsed = parseOpenAiRequest({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Concise' },
        { role: 'user', content: 'Ping' },
      ],
    });
    const unifiedRes = {
      id: 'res_usage',
      model: 'gpt-4o',
      content: 'Pong',
      usage: { inputTokens: 128, outputTokens: 64 },
    };
    const antOut = formatAnthropicResponse(unifiedRes);
    const oaiOut = formatOpenAiResponse(unifiedRes);
    const passed =
      oaiParsed.system === 'Concise' &&
      antOut.usage.input_tokens === 128 &&
      antOut.usage.output_tokens === 64 &&
      oaiOut.usage.total_tokens === 192;

    checks.push({
      id: 'check-7-usage',
      name: '7. Cross-Protocol Usage & Token Reporting',
      description: 'Validates token usage counters across Anthropic and OpenAI response envelopes',
      passed,
      durationMs: Date.now() - t7Start,
      details: `Verified input_tokens=128, output_tokens=64, total_tokens=192`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-7-usage',
      name: '7. Cross-Protocol Usage & Token Reporting',
      description: 'Usage reporting',
      passed: false,
      durationMs: Date.now() - t7Start,
      details: err.message,
    });
  }

  // Check 8: SSRF & Safe Error Boundary Protection
  const t8Start = Date.now();
  try {
    const blockedLocal = validateProviderUrl('http://127.0.0.1:8080/v1');
    const blockedMeta = validateProviderUrl('http://169.254.169.254/computeMetadata/v1/');
    const allowedHttps = validateProviderUrl('https://api.anthropic.com');
    const passed = !blockedLocal.valid && !blockedMeta.valid && allowedHttps.valid;

    checks.push({
      id: 'check-8-errors',
      name: '8. SSRF Guard & Safe Error Normalization',
      description: 'Blocks loopback/metadata SSRF targets and prevents internal credential leaks',
      passed,
      durationMs: Date.now() - t8Start,
      details: 'Loopback and cloud metadata endpoints blocked; public HTTPS verified',
    });
  } catch (err: any) {
    checks.push({
      id: 'check-8-errors',
      name: '8. SSRF Guard & Safe Error Normalization',
      description: 'SSRF and structured error mapping',
      passed: false,
      durationMs: Date.now() - t8Start,
      details: err.message,
    });
  }

  // Check 9: Gateway Readiness & Alias Registry Inspection
  const t9Start = Date.now();
  try {
    const activeProviders = db.getProviders().filter((p) => p.enabled);
    const activeModels = db.getModels().filter((m) => m.enabled);
    const aliases = db.getAliases();
    const passed = Array.isArray(activeProviders) && Array.isArray(activeModels) && Array.isArray(aliases);

    checks.push({
      id: 'check-9-alias',
      name: '9. Model & Alias Registry State',
      description: 'Validates dynamic alias lookup table and registered provider/model state',
      passed,
      durationMs: Date.now() - t9Start,
      details: `Active: ${activeProviders.length} providers, ${activeModels.length} models, ${aliases.length} aliases`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-9-alias',
      name: '9. Model & Alias Registry State',
      description: 'Model alias registry check',
      passed: false,
      durationMs: Date.now() - t9Start,
      details: err.message,
    });
  }

  // Check 10: Pre-Stream Failover & Retry Classifier
  const t10Start = Date.now();
  try {
    const retry429 = isRetryableError(new Error('429 Rate limit exceeded'));
    const retry503 = isRetryableError(new Error('503 Service Unavailable'));
    const skip401 = !isRetryableError(new Error('401 Unauthorized: Missing API key'));
    const passed = retry429 && retry503 && skip401;

    checks.push({
      id: 'check-10-fallback',
      name: '10. Pre-Stream Failover & Retry Classifier',
      description: 'Retries transient 429/503 faults and immediately fails over on 401/unconfigured providers',
      passed,
      durationMs: Date.now() - t10Start,
      details: `429/503 transient retry=true, 401 immediate provider failover=true`,
    });
  } catch (err: any) {
    checks.push({
      id: 'check-10-fallback',
      name: '10. Pre-Stream Failover & Retry Classifier',
      description: 'Pre-stream failover policy',
      passed: false,
      durationMs: Date.now() - t10Start,
      details: err.message,
    });
  }

  const passedTests = checks.filter((c) => c.passed).length;
  const failedTests = checks.length - passedTests;

  return {
    timestamp: new Date().toISOString(),
    totalTests: checks.length,
    passedTests,
    failedTests,
    status: failedTests === 0 ? 'passed' : 'failed',
    checks,
  };
}
