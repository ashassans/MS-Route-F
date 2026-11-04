/**
 * SSRF Protection Module
 * Validates URLs for custom providers to ensure they do not target internal networks,
 * metadata services, or loopback interfaces.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP instance metadata service
  'instance-data',
]);

const BLOCKED_PREFIXES = [
  '10.', // Class A private network
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.', // Class B private network
  '192.168.', // Class C private network
  '169.254.', // Link-local
  'fc00:', 'fe80:', // IPv6 ULA / link-local
];

export interface SsrfValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedUrl?: string;
}

export function validateProviderUrl(urlStr: string): SsrfValidationResult {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, reason: 'URL cannot be empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Must be HTTPS in production; allow HTTP only in explicit testing if needed
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: `Unsupported protocol ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check exact blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `SSRF Violation: requests to loopback or metadata endpoints (${hostname}) are blocked.` };
  }

  // Check private IP prefixes
  for (const prefix of BLOCKED_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      return { valid: false, reason: `SSRF Violation: requests to internal private network address (${hostname}) are blocked.` };
    }
  }

  // Disallow file:, gopher:, dict:, ftp:
  return { valid: true, sanitizedUrl: parsed.origin + parsed.pathname.replace(/\/$/, '') };
}
