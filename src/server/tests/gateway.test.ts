import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, hashGatewayKey, generateGatewayApiKey } from '../security/encryption.ts';
import { validateProviderUrl } from '../security/ssrf.ts';
import { parseAnthropicRequest, formatAnthropicResponse, parseOpenAiRequest, formatOpenAiResponse } from '../adapters/protocol-converter.ts';
import { resolveRoute, resolveComboRoute } from '../engine/router.ts';
import { isRetryableError } from '../engine/fallback.ts';
import { db } from '../store/db.ts';
import { handleGatewayFetch } from '../web-handler.ts';
import { readApiJson } from '../../lib/api.ts';

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
  assert.equal(validateProviderUrl('http://localhost:8080/v1').valid, false);
  assert.equal(validateProviderUrl('http://127.0.0.1:3000').valid, false);
  assert.equal(validateProviderUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(validateProviderUrl('http://10.0.0.1/api').valid, false);
  assert.equal(validateProviderUrl('http://192.168.1.1').valid, false);
  assert.equal(validateProviderUrl('ftp://example.com').valid, false);

  assert.equal(validateProviderUrl('https://api.openai.com/v1').valid, true);
  assert.equal(validateProviderUrl('https://api.anthropic.com').valid, true);
  assert.equal(validateProviderUrl('https://openrouter.ai/api/v1').valid, true);
  assert.equal(validateProviderUrl('https://inference.dahl.global/v1').valid, true);
});

test('4. Protocol Converter: Anthropic Messages parser and formatter', () => {
  const anthropicReq = {
    model: 'claude-3-7-sonnet',
    system: 'You are a staff software engineer.',
    messages: [{ role: 'user', content: 'Debug this function' }],
    tools: [
      {
        name: 'execute_shell',
        description: 'Run shell command',
        input_schema: { type: 'object', properties: { cmd: { type: 'string' } } },
      },
    ],
  };

  const parsed = parseAnthropicRequest(anthropicReq);
  assert.equal(parsed.model, 'claude-3-7-sonnet');
  assert.equal(parsed.system, 'You are a staff software engineer.');
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.tools?.length, 1);
  assert.equal(parsed.tools?.[0].name, 'execute_shell');

  const formatted = formatAnthropicResponse({
    id: 'msg_test123',
    model: 'claude-3-7-sonnet',
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

test('6. Routing Engine & Combo Failover: Isolated fixture resolution and clean cleanup', () => {
  const now = new Date().toISOString();
  db.saveProvider({
    id: 'test-prov-a',
    name: 'Test Provider A',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic-messages',
    models: ['test-model-a'],
    defaultModel: 'test-model-a',
    timeoutMs: 10000,
    priority: 1,
    maxRetries: 1,
    enabled: true,
    health: { status: 'healthy', recentErrorsCount: 0 },
    createdAt: now,
    updatedAt: now,
  });
  db.saveProvider({
    id: 'test-prov-b',
    name: 'Test Provider B',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    protocol: 'google-gemini',
    models: ['test-model-b'],
    defaultModel: 'test-model-b',
    timeoutMs: 10000,
    priority: 2,
    maxRetries: 1,
    enabled: true,
    health: { status: 'healthy', recentErrorsCount: 0 },
    createdAt: now,
    updatedAt: now,
  });
  db.saveModel({
    id: 'test-model-a',
    displayName: 'Test Model A',
    providerId: 'test-prov-a',
    apiModelName: 'test-model-a',
    contextWindow: 200000,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
    pricing: { inputPer1MTokens: 3, outputPer1MTokens: 15 },
    enabled: true,
  });
  db.saveModel({
    id: 'test-model-b',
    displayName: 'Test Model B',
    providerId: 'test-prov-b',
    apiModelName: 'test-model-b',
    contextWindow: 1000000,
    capabilities: { streaming: true, tools: true, vision: true, reasoning: true, jsonOutput: true },
    pricing: { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
    enabled: true,
  });
  db.saveAlias({
    id: 'test-alias-fast',
    alias: 'unit-fast',
    description: 'Unit test alias',
    targetType: 'model',
    targetId: 'test-model-b',
  });
  db.saveCombo({
    id: 'test-combo-seq',
    name: 'Test Failover Combo',
    description: 'Unit test combo',
    strategy: 'sequential',
    steps: [
      { providerId: 'test-prov-a', modelId: 'test-model-a', priority: 1 },
      { providerId: 'test-prov-b', modelId: 'test-model-b', priority: 2 },
    ],
    retryRules: {
      maxAttempts: 2,
      backoffMs: 100,
      retryOnRateLimit: true,
      retryOnTimeout: true,
      retryOnServerError: true,
    },
    timeoutMs: 10000,
    enabled: true,
  });

  try {
    const rFast = resolveRoute('unit-fast', { model: 'unit-fast', messages: [] });
    assert.match(rFast.strategy, /alias:unit-fast/);
    assert.equal(rFast.selectedModel.id, 'test-model-b');

    const combo = db.getCombo('test-combo-seq');
    assert.ok(combo);
    const route = resolveComboRoute(combo);
    assert.equal(route.isCombo, true);
    assert.equal(route.selectedProvider.id, 'test-prov-a');
    assert.equal(route.fallbackChain?.length, 1);
  } finally {
    db.deleteCombo('test-combo-seq');
    db.deleteAlias('test-alias-fast');
    db.deleteModel('test-model-a');
    db.deleteModel('test-model-b');
    db.deleteProvider('test-prov-a');
    db.deleteProvider('test-prov-b');
  }
});

test('7. Resilience: Error categorization for retry & failover', () => {
  assert.equal(isRetryableError(new Error('429 Rate limit exceeded')), true);
  assert.equal(isRetryableError(new Error('503 Service Unavailable')), true);
  assert.equal(isRetryableError(new Error('Gateway timeout')), true);
  assert.equal(isRetryableError(new Error('ECONNRESET')), true);

  assert.equal(isRetryableError(new Error('401 Unauthorized')), false);
  assert.equal(isRetryableError(new Error('Invalid api key provided')), false);
  assert.equal(isRetryableError(new Error('Missing API key for provider')), false);
});

test('8. Cloudflare Worker Web Fetch Handler: Custom provider & slash model ID lifecycle', async () => {
  let persistedSnapshots = 0;
  const originalSnapshot = db.serializeFullState();
  db.setPersistenceHook(() => {
    persistedSnapshots += 1;
  });

  try {
    const createRes = await handleGatewayFetch(
      new Request('https://msroute.awesx.workers.dev/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'test-dahl',
          name: 'dahl',
          type: 'custom',
          protocol: 'openai-chat',
          baseUrl: 'https://inference.dahl.global/v1',
          apiKey: 'sk-dahl-test-secret-9999',
          models: ['MiniMaxAI/MiniMax-M2.7'],
          defaultModel: 'MiniMaxAI/MiniMax-M2.7',
          timeoutMs: 30000,
          priority: 2,
          maxRetries: 5,
          enabled: true,
        }),
      })
    );

    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.equal(created.success, true);
    assert.equal(created.provider.id, 'test-dahl');
    assert.equal(created.provider.hasApiKey, true);
    assert.ok(persistedSnapshots >= 2, 'Should persist both provider and auto-registered model');

    const modelsRes = await handleGatewayFetch(new Request('https://msroute.awesx.workers.dev/api/models'));
    const models = await modelsRes.json();
    assert.ok(models.some((m: any) => m.id === 'MiniMaxAI/MiniMax-M2.7'));

    const delModelRes = await handleGatewayFetch(
      new Request(`https://msroute.awesx.workers.dev/api/models/${encodeURIComponent('MiniMaxAI/MiniMax-M2.7')}`, {
        method: 'DELETE',
      })
    );
    const delModelData = await delModelRes.json();
    assert.equal(delModelData.success, true);

    const delProvRes = await handleGatewayFetch(
      new Request('https://msroute.awesx.workers.dev/api/providers/test-dahl', {
        method: 'DELETE',
      })
    );
    const delProvData = await delProvRes.json();
    assert.equal(delProvData.success, true);
  } finally {
    db.setPersistenceHook(null);
    db.hydrateFromJson(originalSnapshot);
  }
});

test('9. Safe API JSON reader handles empty 405 and HTML responses gracefully', async () => {
  const empty405 = new Response('', { status: 405 });
  await assert.rejects(
    () => readApiJson(empty405, 'Providers API'),
    /Providers API returned an empty response \(HTTP 405\)/
  );

  const htmlFallback = new Response('<!doctype html><html><body>Not Found</body></html>', { status: 200 });
  await assert.rejects(
    () => readApiJson(htmlFallback, 'Providers API'),
    /Providers API returned HTML instead of JSON/
  );
});

