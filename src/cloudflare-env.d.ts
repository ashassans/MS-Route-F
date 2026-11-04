interface SqlStorageCursor<T = Record<string, unknown>> {
  toArray(): T[];
}

interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>;
}

interface DurableObjectStorage {
  sql: SqlStorage;
}

interface CfDurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

interface CfDurableObjectId {
  toString(): string;
}

interface CfDurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface CfDurableObjectNamespace {
  idFromName(name: string): CfDurableObjectId;
  get(id: CfDurableObjectId): CfDurableObjectStub;
}

declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    protected ctx: CfDurableObjectState;
    protected env: Env;
    constructor(ctx: CfDurableObjectState, env: Env);
    fetch(request: Request): Promise<Response> | Response;
  }
}
