import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  isUserEmailVerified,
  isValidEmail,
  validatePdfAttachmentDataUri,
} from '@/lib/utils/security';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const emailRateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (emailRateLimitMap.get(userId) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    emailRateLimitMap.set(userId, timestamps);
    return true;
  }
  timestamps.push(now);
  emailRateLimitMap.set(userId, timestamps);
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate and verify the caller session server-side (fail-closed)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !supabaseUrl ||
      !supabaseKey ||
      supabaseUrl.includes('placeholder') ||
      supabaseUrl === 'https://your-supabase-project.supabase.co'
    ) {
      return NextResponse.json(
        { error: 'Authentication service is not configured.' },
        { status: 503 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Readonly in some contexts
          }
        },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to send invoice emails.' },
        { status: 401 }
      );
    }

    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: 'Forbidden: Please verify your email address before sending invoices.' },
        { status: 403 }
      );
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: 'Too many email requests. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    // 2. Parse payload with explicit allowlist (drops role, permissions, price, credits, status, IDs, etc.)
    const body = await request.json();
    const to_email = typeof body.to_email === 'string' ? body.to_email.trim() : '';
    const bill_number = typeof body.bill_number === 'string' ? body.bill_number.trim().slice(0, 64) : '';
    const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim().slice(0, 120) : '';
    const grand_total = typeof body.grand_total === 'string' || typeof body.grand_total === 'number' ? String(body.grand_total).slice(0, 32) : '';
    const shop_name = typeof body.shop_name === 'string' ? body.shop_name.trim().slice(0, 120) : '';
    const message_html = typeof body.message_html === 'string' ? body.message_html.slice(0, 500_000) : '';
    const message_text = typeof body.message_text === 'string' ? body.message_text.slice(0, 100_000) : '';
    const pdf_attachment = typeof body.pdf_attachment === 'string' ? body.pdf_attachment : '';
    const customServiceId = typeof body.customServiceId === 'string' ? body.customServiceId.trim() : undefined;
    const customTemplateId = typeof body.customTemplateId === 'string' ? body.customTemplateId.trim() : undefined;
    const customPublicKey = typeof body.customPublicKey === 'string' ? body.customPublicKey.trim() : undefined;

    if (!isValidEmail(to_email)) {
      return NextResponse.json({ error: 'A valid recipient email address is required.' }, { status: 400 });
    }

    const attachmentCheck = validatePdfAttachmentDataUri(pdf_attachment);
    if (!attachmentCheck.valid) {
      return NextResponse.json({ error: attachmentCheck.error }, { status: 400 });
    }

    // 3. Resolve service credentials (server-side environment variables take precedence)
    const serviceId = process.env.EMAILJS_SERVICE_ID || customServiceId;
    const templateId = process.env.EMAILJS_TEMPLATE_ID || customTemplateId;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY || customPublicKey;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !publicKey) {
      return NextResponse.json(
        { error: 'EmailJS credentials not configured on the server or in shop settings.' },
        { status: 400 }
      );
    }

    // 4. Dispatch email via EmailJS HTTP API server-to-server
    const payload: Record<string, unknown> = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email,
        bill_number: bill_number || 'N/A',
        customer_name: customer_name || 'Valued Customer',
        grand_total: grand_total || '0.00',
        shop_name: shop_name || 'Store',
        message_html: message_html || '',
        message_text: message_text || '',
        pdf_attachment: pdf_attachment || '',
      },
    };

    if (privateKey) {
      payload.accessToken = privateKey;
    }

    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error('EmailJS delivery failed:', emailResponse.status, errText);
      return NextResponse.json(
        { error: 'Failed to deliver email through EmailJS service.' },
        { status: emailResponse.status >= 400 && emailResponse.status < 500 ? 400 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice email sent successfully.',
    });
  } catch (err: unknown) {
    console.error('Unhandled /api/send-email error:', err);
    return NextResponse.json({ error: 'Failed to send invoice email.' }, { status: 500 });
  }
}
