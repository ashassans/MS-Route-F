import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, hashGatewayKey, generateGatewayApiKey } from '../security/encryption.ts';
import { validateProviderUrl } from '../security/ssrf.ts';
import { parseAnthropicRequest, formatAnthropicResponse, parseOpenAiRequest, formatOpenAiResponse } from '../adapters/protocol-converter.ts';
import { resolveRoute, resolveComboRoute } from '../engine/router.ts';
import { isRetryableError } from '../engine/fallback.ts';
import { db } from '../store/db.ts';

test('1. Security: AES-256-GCM encryption & decryption roundtrip', () => {
  const secretKey = 'sk-ant-api03-test-secret-key-12345';
  const encrypted = encryptSecret(secretKey);
  assert.notEqual(encrypted, secretKey);
  assert.equal(encrypted.split(':').length, 3, 'Encrypted format should be iv:tag:ciphertext');

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secretKey);
});

test('2. Security: Gateway API key generation and SHA-256 hashing', () => {
  const { rawKey, keyPrefix, keyHash } = generateGatewayApiKey();
  assert.match(rawKey, /^gw-live-[a-f0-9]{48}$/);
  assert.match(keyPrefix, /^gw-live-[a-f0-9]{6}\.\.\.$/);

  const recomputedHash = hashGatewayKey(rawKey);
  assert.equal(recomputedHash, keyHash);
});

test('3. Security: SSRF validation blocks malicious and private URLs', () => {
  // Blocked targets
  assert.equal(validateProviderUrl('http://localhost:8080/v1').valid, false);
  assert.equal(validateProviderUrl('http://127.0.0.1:3000').valid, false);
  assert.equal(validateProviderUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(validateProviderUrl('http://10.0.0.1/api').valid, false);
  assert.equal(validateProviderUrl('http://192.168.1.1').valid, false);
  assert.equal(validateProviderUrl('ftp://example.com').valid, false);

  // Allowed legitimate targets
  assert.equal(validateProviderUrl('https://api.openai.com/v1').valid, true);
  assert.equal(validateProviderUrl('https://api.anthropic.com').valid, true);
  assert.equal(validateProviderUrl('https://openrouter.ai/api/v1').valid, true);
});

test('4. Protocol Converter: Anthropic Messages parser and formatter', () => {
  const anthropicReq = {
    model: 'claude-3-5-sonnet-20241022',
    system: 'You are a staff software engineer.',
    messages: [
      { role: 'user', content: 'Debug this function' },
    ],
    tools: [
      {
        name: 'execute_shell',
        description: 'Run shell command',
        input_schema: { type: 'object', properties: { cmd: { type: 'string' } } },
      },
    ],
  };

  const parsed = parseAnthropicRequest(anthropicReq);
  assert.equal(parsed.model, 'claude-3-5-sonnet-20241022');
  assert.equal(parsed.system, 'You are a staff software engineer.');
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.tools?.length, 1);
  assert.equal(parsed.tools?.[0].name, 'execute_shell');

  const formatted = formatAnthropicResponse({
    id: 'msg_test123',
    model: 'claude-3-5-sonnet-20241022',
    content: 'Fixed the function.',
    toolCalls: [{ id: 'call_1', name: 'execute_shell', arguments: '{"cmd":"npm test"}' }],
    usage: { inputTokens: 120, outputTokens: 45 },
  });

  assert.equal(formatted.type, 'message');
  assert.equal(formatted.role, 'assistant');
  assert.equal(formatted.content.length, 2);
  assert.equal(formatted.content[0].type, 'text');
  assert.equal(formatted.content[1].type, 'tool_use');
});

test('5. Protocol Converter: OpenAI Chat Completions parser and formatter', () => {
  const openAiReq = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Be concise' },
      { role: 'user', content: 'What is 2+2?' },
    ],
  };

  const parsed = parseOpenAiRequest(openAiReq);
  assert.equal(parsed.system, 'Be concise');
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0].role, 'user');

  const formatted = formatOpenAiResponse({
    id: 'chatcmpl_test',
    model: 'gpt-4o',
    content: '4',
    usage: { inputTokens: 10, outputTokens: 2 },
  });

  assert.equal(formatted.object, 'chat.completion');
  assert.equal(formatted.choices[0].message.content, '4');
});

test('6. Routing Engine: Dynamic model alias resolution', () => {
  const dummyReq = { model: 'my-coding', messages: [] };
  const rCoding = resolveRoute('my-coding', dummyReq);
  assert.match(rCoding.strategy, /alias:my-coding|combo:Production Coding Failover/);

  const rFast = resolveRoute('my-fast', { model: 'my-fast', messages: [] });
  assert.match(rFast.strategy, /alias:my-fast/);
  assert.equal(rFast.selectedModel.id, 'gemini-2.5-flash');

  const rSonnet = resolveRoute('claude-3-5-sonnet-20241022', { model: 'claude-3-5-sonnet-20241022', messages: [] });
  assert.ok(rSonnet.selectedProvider);
});

test('7. Combo Routing: Sequential failover chain assembly', () => {
  const combo = db.getCombo('combo-prod-coding');
  assert.ok(combo);
  const route = resolveComboRoute(combo);
  assert.equal(route.isCombo, true);
  assert.equal(route.selectedProvider.id, 'prov-anthropic');
  assert.equal(route.fallbackChain?.length, 2, 'Should have 2 secondary fallback providers');
});

test('8. Resilience: Error categorization for retry & failover', () => {
  // Retryable errors
  assert.equal(isRetryableError(new Error('429 Rate limit exceeded')), true);
  assert.equal(isRetryableError(new Error('503 Service Unavailable')), true);
  assert.equal(isRetryableError(new Error('Gateway timeout')), true);
  assert.equal(isRetryableError(new Error('ECONNRESET')), true);

  // Non-retryable permanent errors
  assert.equal(isRetryableError(new Error('401 Unauthorized')), false);
  assert.equal(isRetryableError(new Error('Invalid api key provided')), false);
});
