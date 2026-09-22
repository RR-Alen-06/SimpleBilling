'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'signup'
    | 'recovery'
    | 'invite'
    | 'email'
    | 'email_change'
    | 'magiclink'
    | null;
  const next = searchParams.get('next') ?? (type === 'recovery' ? '/reset-password' : '/');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleVerify = async () => {
    if (!token_hash || !type) {
      setStatus('error');
      setErrorMessage('Invalid verification link. Missing token or confirmation type.');
      return;
    }

    if (!isSupabaseConfigured) {
      setStatus('error');
      setErrorMessage('Supabase is not configured properly in this environment.');
      return;
    }

    setStatus('verifying');
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      if (error) {
        throw error;
      }

      setStatus('success');
      setTimeout(() => {
        router.push(next);
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Confirmation link is invalid or has already been used. Please request a new link or enter your OTP code manually.'
      );
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-8 space-y-6">
        
        {/* Header Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mb-2 shadow-sm">
            {status === 'verifying' ? (
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            ) : status === 'success' ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            ) : status === 'error' ? (
              <AlertTriangle className="w-7 h-7 text-rose-600" />
            ) : (
              <ShieldCheck className="w-7 h-7 text-blue-600" />
            )}
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {status === 'success'
              ? 'Email Verified Successfully!'
              : status === 'error'
              ? 'Verification Failed'
              : 'Confirm Your Email'}
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {status === 'success'
              ? 'Your identity has been authenticated. Redirecting to your dashboard...'
              : status === 'error'
              ? 'We were unable to verify this confirmation token.'
              : 'Click the button below to verify your account and safely establish your session.'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-rose-600" />
              Token Expired or Invalid
            </div>
            <p className="text-[11px] leading-relaxed text-rose-700">{errorMessage}</p>
          </div>
        )}

        {/* Action Button */}
        {status === 'idle' && (
          <button
            onClick={handleVerify}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>Verify &amp; Continue</span>
            <ArrowRight size={16} />
          </button>
        )}

        {status === 'verifying' && (
          <div className="w-full bg-slate-100 text-slate-600 font-semibold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <span>Verifying session with Supabase...</span>
          </div>
        )}

        {status === 'success' && (
          <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Redirecting...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 pt-2">
            <button
              onClick={handleVerify}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs py-3 px-4 rounded-xl transition flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              <span>Retry Verification</span>
            </button>
            <Link
              href="/login"
              className="block text-center text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Return to Login Screen
            </Link>
          </div>
        )}

        <div className="pt-2 text-center border-t border-slate-100 text-[10px] text-slate-400 font-mono">
          PRINTPRO ERP • SECURE AUTH BRIDGE
        </div>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
