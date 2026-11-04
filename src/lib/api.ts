/**
 * Safely reads JSON from a fetch Response without throwing
 * "Unexpected end of JSON input" when a static host or reverse proxy
 * returns an empty 404/405/502 response or HTML error page.
 */
export async function readApiJson<T = any>(res: Response, endpointLabel = 'Backend API'): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error(
      `${endpointLabel} returned an empty response (HTTP ${res.status}). Make sure the full-stack Worker/Server backend is deployed (wrangler deploy / server.ts), not static HTML assets only.`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
      throw new Error(
        `${endpointLabel} returned HTML instead of JSON (HTTP ${res.status}). Ensure /api/* routes are handled by the Worker/Server backend rather than static SPA fallback.`
      );
    }
    throw new Error(`${endpointLabel} error (HTTP ${res.status}): ${trimmed.slice(0, 180)}`);
  }
}
