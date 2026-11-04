import { DurableObject } from 'cloudflare:workers';
import { db } from './server/store/db.ts';
import { handleGatewayFetch } from './server/web-handler.ts';

export interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GATEWAY_DO: CfDurableObjectNamespace;
  GATEWAY_ENCRYPTION_SECRET?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

function syncWorkerEnvToProcess(env: WorkerEnv): void {
  if (typeof process === 'undefined' || !process.env) return;
  process.env.CLOUDFLARE_WORKER = '1';
  if (env.GATEWAY_ENCRYPTION_SECRET) process.env.GATEWAY_ENCRYPTION_SECRET = env.GATEWAY_ENCRYPTION_SECRET;
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY;
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;
  if (env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
}

/**
 * SQLite-backed Durable Object persisting MSRoute providers, models, encrypted keys,
 * combos, routing rules, request logs, and settings on Cloudflare Workers (Free & Paid tiers).
 */
export class MSRouteGatewayDO extends DurableObject<WorkerEnv> {
  constructor(ctx: CfDurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    syncWorkerEnvToProcess(env);

    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS gateway_state (id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)'
    );

    const rows = ctx.storage.sql
      .exec<{ state_json: string }>('SELECT state_json FROM gateway_state WHERE id = 1')
      .toArray();

    if (rows.length > 0 && rows[0]?.state_json) {
      db.hydrateFromJson(rows[0].state_json);
    } else {
      db.hydrateFromJson(null);
      ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO gateway_state (id, state_json) VALUES (1, ?)',
        db.serializeFullState()
      );
    }

    db.setPersistenceHook((json: string) => {
      ctx.storage.sql.exec('INSERT OR REPLACE INTO gateway_state (id, state_json) VALUES (1, ?)', json);
    });
  }

  async fetch(request: Request): Promise<Response> {
    syncWorkerEnvToProcess(this.env);
    return handleGatewayFetch(request);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      if (env.GATEWAY_DO) {
        const id = env.GATEWAY_DO.idFromName('msroute-global-gateway');
        const stub = env.GATEWAY_DO.get(id);
        return stub.fetch(request);
      }
      syncWorkerEnvToProcess(env);
      return handleGatewayFetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
