'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  Printer,
  Lock,
  Mail,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Loader2,
  X
} from 'lucide-react';

function LoginFormContent() {
  const searchParams = useSearchParams();

  const initialTab = searchParams.get('tab') === 'otp' ? 'otp' : 'password';
  const initialType = (searchParams.get('type') as 'signup' | 'magiclink' | 'recovery' | 'email') || 'signup';

  const [activeTab, setActiveTab] = useState<'password' | 'otp'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpType, setOtpType] = useState<'signup' | 'magiclink' | 'recovery' | 'email'>(initialType);
  const [loading, setLoading] = useState(false);

  // Initialize errors/messages from URL query params without cascading effect renders
  const [errorMsg, setErrorMsg] = useState(() => {
    const errorParam = searchParams.get('error') || searchParams.get('error_description');
    return errorParam ? decodeURIComponent(errorParam) : '';
  });
  const [successMsg, setSuccessMsg] = useState(() => {
    const messageParam = searchParams.get('message');
    return messageParam ? decodeURIComponent(messageParam) : '';
  });

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  const grantAccessAndRedirect = (msg: string, dest: string = '/') => {
    setSuccessMsg(msg);
    setTimeout(() => {
      window.location.href = dest;
    }, 500);
  };

  // Password Login Handler
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please check your environment variables.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        throw new Error(error.message || 'Invalid email or password.');
      }

      if (data.user) {
        grantAccessAndRedirect('Authenticated successfully! Redirecting...');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // 6-Digit OTP Verification Handler
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const cleanToken = otpToken.trim();

    if (!cleanEmail || !cleanToken) {
      setErrorMsg('Please provide both your registered email and the 6-digit confirmation code.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: otpType,
      });

      if (error) {
        throw error;
      }

      if (data.session || data.user) {
        if (otpType === 'recovery') {
          grantAccessAndRedirect('Recovery code verified! Redirecting to set new password...', '/reset-password');
        } else {
          grantAccessAndRedirect('Email confirmed successfully! Redirecting to dashboard...');
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to verify code. Please make sure the code is correct and not expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Send Password Reset / Magic Link Handler
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');

    const cleanEmail = forgotEmail.trim();
    if (!cleanEmail) {
      setForgotError('Please enter your email address.');
      return;
    }

    setForgotLoading(true);
    try {
      const redirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=recovery`
        : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        throw error;
      }

      setForgotMessage('Password recovery email sent! Please check your inbox or spam folder.');
    } catch (err: unknown) {
      setForgotError(err instanceof Error ? err.message : 'Failed to send recovery email.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Two-column card */}
      <div className="max-w-2xl w-full flex flex-col md:flex-row rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        
        {/* LEFT — Brand panel */}
        <div className="bg-slate-900 text-white w-full md:w-60 p-8 flex flex-col justify-between flex-shrink-0">
          <div>
            <div className="inline-flex bg-blue-600/20 border border-blue-500/30 text-blue-300 p-3 rounded-xl mb-6 shadow-inner">
              <Printer size={28} />
            </div>
            <h1 className="text-lg font-extrabold leading-tight text-white tracking-tight">PrintPro ERP</h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">Xerox &amp; Stationery Management System</p>
          </div>
          <div className="hidden md:block space-y-3 text-[11px] text-slate-400 mt-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              Billing &amp; Thermal Receipts
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
              Customer Ledgers &amp; Dues
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block"></span>
              Reports &amp; GST Analytics
            </div>
          </div>
        </div>

        {/* RIGHT — Form panel */}
        <div className="flex-1 bg-white p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Admin Portal</h2>
            <p className="text-xs text-slate-500">Sign in to access your shop dashboard</p>
          </div>

          {/* Flow Toggle Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('password');
                setErrorMsg('');
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                activeTab === 'password'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Password Login
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('otp');
                setErrorMsg('');
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'otp'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ShieldCheck size={13} />
              <span>Verify 6-Digit OTP</span>
            </button>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg flex items-start space-x-2 text-rose-800 text-xs">
              <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Authentication Notice</span>
                <span className="text-[11px] leading-tight">{errorMsg}</span>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg flex items-center space-x-2 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: Password Form */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgotModal(true);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center space-x-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: 6-Digit OTP Form */}
          {activeTab === 'otp' && (
            <form onSubmit={handleOtpVerify} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    6-Digit Confirmation Code
                  </label>
                  <select
                    value={otpType}
                    onChange={(e) => setOtpType(e.target.value as 'signup' | 'magiclink' | 'recovery' | 'email')}
                    className="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 font-medium"
                  >
                    <option value="signup">Signup Confirm</option>
                    <option value="magiclink">Magic Link</option>
                    <option value="recovery">Password Recovery</option>
                    <option value="email">Email Change</option>
                  </select>
                </div>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="123456"
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm tracking-widest font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter the 6-digit code received in your confirmation or recovery email.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center space-x-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Sign In</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="pt-1 text-center border-t border-slate-100 text-[10px] text-slate-400 font-mono">
            PRINTPRO ERP • ACCESS GUARD
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setShowForgotModal(false);
                setForgotMessage('');
                setForgotError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={18} />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">Reset Password</h3>
              <p className="text-xs text-slate-500">
                We&apos;ll email you a recovery link and 6-digit code.
              </p>
            </div>

            {forgotError && (
              <div className="bg-rose-50 text-rose-700 text-xs p-2.5 rounded-lg">
                {forgotError}
              </div>
            )}

            {forgotMessage && (
              <div className="bg-emerald-50 text-emerald-700 text-xs p-2.5 rounded-lg font-semibold">
                {forgotMessage}
              </div>
            )}

            <form onSubmit={handleSendResetEmail} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {forgotLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Recovery Email</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
