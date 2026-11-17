const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  if (/[\r\n]/.test(email)) return false;
  return EMAIL_REGEX.test(email);
}

export function sanitizeRedirectPath(
  nextPath: string | null | undefined,
  fallback: string = '/'
): string {
  if (!nextPath || typeof nextPath !== 'string') return fallback;
  const trimmed = nextPath.trim();
  // Must start with a single '/' and not '//', '/\', or contain control characters
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    /[\x00-\x1f\x7f]/.test(trimmed)
  ) {
    return fallback;
  }
  return trimmed;
}

export function isUserEmailVerified(
  user:
    | {
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
        app_metadata?: { provider?: string };
      }
    | null
    | undefined
): boolean {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  return Boolean(
    user.email_confirmed_at ||
      user.confirmed_at ||
      (provider && provider !== 'email')
  );
}

export function validatePdfAttachmentDataUri(
  dataUri: string,
  maxBytes: number = 5 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (!dataUri) return { valid: true };
  if (!dataUri.startsWith('data:application/pdf;')) {
    return { valid: false, error: 'Invalid attachment format. Only PDF data URIs are allowed.' };
  }
  const base64Idx = dataUri.indexOf('base64,');
  if (base64Idx === -1) {
    return { valid: false, error: 'Invalid PDF attachment encoding.' };
  }
  const base64Len = dataUri.length - (base64Idx + 7);
  const estimatedBytes = Math.ceil((base64Len * 3) / 4);
  if (estimatedBytes > maxBytes) {
    return { valid: false, error: 'PDF attachment exceeds maximum allowed size (5 MB).' };
  }
  return { valid: true };
}
