import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  escapeHtml,
  isValidEmail,
  sanitizeRedirectPath,
  isUserEmailVerified,
  validatePdfAttachmentDataUri,
} from '../src/lib/utils/security.ts';

const rootDir = path.resolve(import.meta.dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

test('SEC-01: RLS hardening migration revokes anon access and scopes to auth.uid()', () => {
  const sql = read('supabase/migrations/20261114_harden_rls_policies.sql');
  const tables = [
    'sequences',
    'customers',
    'products',
    'bills',
    'bill_items',
    'payments',
    'expenses',
    'settings',
    'audit_logs',
    'loyalty_transactions',
    'loyalty_rules',
    'loyalty_redemption_rules',
    'internal_transfers',
    'accounting_closings',
  ];

  for (const t of tables) {
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon;`), `Missing REVOKE for ${t}`);
    assert.match(sql, new RegExp(`DROP POLICY IF EXISTS "Unified access to ${t}" ON public\\.${t};`), `Missing DROP POLICY for ${t}`);
  }
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_next_sequence\(TEXT\) FROM anon, PUBLIC;/);
  assert.match(sql, /IF v_user_id IS NULL THEN\s+RAISE EXCEPTION/);
});

test('SEC-02: change-user-email Edge Function does not trust user_metadata for admin role', () => {
  const fnSource = read('supabase/functions/change-user-email/index.ts');
  assert.doesNotMatch(fnSource, /user_metadata\?\.role/);
  assert.match(fnSource, /callerUser\.app_metadata\?\.role === 'admin'/);
  assert.doesNotMatch(fnSource, /\$\{updateErr\.message\}/);
  assert.doesNotMatch(fnSource, /\$\{errorMsg\}/);
});

test('SEC-03: send-email API and proxy fail closed and verify email confirmation properly', () => {
  const sendEmailSource = read('src/app/api/send-email/route.ts');
  assert.match(sendEmailSource, /status:\s*503/);
  assert.match(sendEmailSource, /isUserEmailVerified\(user\)/);

  const proxySource = read('src/proxy.ts');
  assert.match(proxySource, /process\.env\.NODE_ENV === 'production'/);
  assert.match(proxySource, /isUserEmailVerified\(user\)/);

  assert.equal(isUserEmailVerified(null), false);
  assert.equal(isUserEmailVerified({ app_metadata: {} }), false);
  assert.equal(isUserEmailVerified({ app_metadata: { provider: 'email' } }), false);
  assert.equal(
    isUserEmailVerified({ email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' } }),
    true
  );
  assert.equal(isUserEmailVerified({ app_metadata: { provider: 'google' } }), true);
});

test('SEC-04: HTML escaping, email validation, and PDF attachment validation block malicious payloads', () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script> & \'test\''),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;'
  );

  const apiSource = read('src/lib/services/api.ts');
  assert.match(apiSource, /escapeHtml\(shopSettings\?\.shop_name/);
  assert.match(apiSource, /escapeHtml\(bill\.customer_name/);
  assert.match(apiSource, /escapeHtml\(item\.product_name\)/);

  assert.equal(isValidEmail('customer@example.com'), true);
  assert.equal(isValidEmail("evil@example.com\r\nBcc: victim@example.com"), false);
  assert.equal(isValidEmail('not-an-email'), false);

  assert.equal(validatePdfAttachmentDataUri('').valid, true);
  assert.equal(validatePdfAttachmentDataUri('data:text/html;base64,PHNjcmlwdD4=').valid, false);
  assert.equal(validatePdfAttachmentDataUri('data:application/pdf;filename=inv.pdf;base64,JVBERi0=').valid, true);
  const oversized = 'data:application/pdf;base64,' + 'A'.repeat(8 * 1024 * 1024);
  assert.equal(validatePdfAttachmentDataUri(oversized).valid, false);
});

test('SEC-06: next.config.ts sets required HTTP security headers', () => {
  const nextConfig = read('next.config.ts');
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /Referrer-Policy/);
  assert.match(nextConfig, /Permissions-Policy/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /Strict-Transport-Security/);
});

test('SEC-07: error.tsx hides raw error.message in production', () => {
  const errorTsx = read('src/app/error.tsx');
  assert.match(errorTsx, /process\.env\.NODE_ENV !== 'production' && error\?\.message/);
});

test('SEC-08: send-email API enforces per-user rate limiting', () => {
  const sendEmailSource = read('src/app/api/send-email/route.ts');
  assert.match(sendEmailSource, /isRateLimited\(user\.id\)/);
  assert.match(sendEmailSource, /status:\s*429/);
});

test('SEC-09: sanitizeRedirectPath prevents open redirects', () => {
  assert.equal(sanitizeRedirectPath('/reset-password'), '/reset-password');
  assert.equal(sanitizeRedirectPath('/customers/123?tab=bills'), '/customers/123?tab=bills');
  assert.equal(sanitizeRedirectPath('//evil.com'), '/');
  assert.equal(sanitizeRedirectPath('/\\evil.com'), '/');
  assert.equal(sanitizeRedirectPath('https://evil.com'), '/');
  assert.equal(sanitizeRedirectPath('/foo\r\nbar'), '/');
});

test('SEC-10: signup and password reset enforce minimum 8-character passwords', () => {
  const loginSource = read('src/app/login/page.tsx');
  const resetSource = read('src/app/reset-password/page.tsx');
  assert.match(loginSource, /cleanPassword\.length < 8/);
  assert.match(resetSource, /password\.length < 8/);
});
