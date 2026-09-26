'use client';

import React, { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  Printer,
  Lock,
  Mail,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Loader2,
  X,
  RefreshCw,
  ArrowLeft,
  Send,
  UserPlus,
  LogIn,
  Clock,
  Sparkles
} from 'lucide-react';

function LoginFormContent() {
  const searchParams = useSearchParams();

  const urlCode = searchParams.get('code');
  const urlTokenHash = searchParams.get('token_hash');
  const urlToken = searchParams.get('token') || '';
  const urlTab = searchParams.get('tab');
  const initialType = (searchParams.get('type') as 'signup' | 'magiclink' | 'recovery' | 'email') || 'signup';
  const initialEmail = searchParams.get('email') || '';

  // Mode: 'signin' | 'signup' | 'check-email'
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'check-email'>(() => {
    if (urlTab === 'signup') return 'signup';
    if (urlTab === 'check-email' || urlTab === 'verify-email') return 'check-email';
    return 'signin';
  });

  // Sign In Sub-tabs: 'password' | 'otp'
  const [activeTab, setActiveTab] = useState<'password' | 'otp'>(() => {
    if (urlTab === 'otp' || urlCode || urlTokenHash || (urlToken && authMode !== 'check-email')) return 'otp';
    return 'password';
  });

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2-Step OTP / Check-Email State
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>(urlToken || urlCode || urlTokenHash ? 'verify' : 'request');
  const [otpType, setOtpType] = useState<'signup' | 'magiclink' | 'recovery' | 'email'>(initialType);
  const [pin, setPin] = useState<string[]>(() => {
    if (urlToken.length === 6) {
      return urlToken.split('');
    }
    return ['', '', '', '', '', ''];
  });
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendingLink, setResendingLink] = useState(false);
  const [exchangingCode, setExchangingCode] = useState(Boolean(urlCode || urlTokenHash));

  // Input refs for 6-box PIN input
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeExchangedRef = useRef(false);

  // Initialize errors/messages from URL query params
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

  const grantAccessAndRedirect = useCallback((msg: string, dest: string = '/') => {
    setSuccessMsg(msg);
    setTimeout(() => {
      window.location.href = dest;
    }, 600);
  }, []);

  // Exchange PKCE Code or Token Hash if present in URL (e.g. from email link)
  useEffect(() => {
    if ((!urlCode && !urlTokenHash) || codeExchangedRef.current) return;
    codeExchangedRef.current = true;

    async function exchangeAuthParams() {
      if (!isSupabaseConfigured) {
        setExchangingCode(false);
        setErrorMsg('Supabase is not configured.');
        return;
      }

      setExchangingCode(true);
      setErrorMsg('');

      try {
        if (urlCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(urlCode);
          if (error) throw error;
          if (data.session || data.user) {
            grantAccessAndRedirect('Authenticated via secure link! Redirecting to dashboard...');
            return;
          }
        } else if (urlTokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: urlTokenHash,
            type: otpType,
          });
          if (error) throw error;
          if (data.session || data.user) {
            if (otpType === 'recovery') {
              grantAccessAndRedirect('Verified! Redirecting to reset password...', '/reset-password');
            } else {
              grantAccessAndRedirect('Authenticated successfully! Redirecting to dashboard...');
            }
            return;
          }
        }
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : '';
        if (rawMsg.includes('code verifier') || rawMsg.includes('PKCE') || rawMsg.includes('storage')) {
          setErrorMsg('Link opened in a different browser session. Please enter the 6-digit OTP code sent to your email.');
        } else {
          setErrorMsg(
            rawMsg || 'Authentication link is invalid or expired. Please enter your 6-digit OTP code below.'
          );
        }
        setOtpStep('verify');
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 150);
      } finally {
        setExchangingCode(false);
      }
    }

    exchangeAuthParams();
  }, [urlCode, urlTokenHash, otpType, grantAccessAndRedirect]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Handle Sign-Up with Email Verification
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please check your environment variables.');
      return;
    }

    setLoading(true);
    try {
      const emailRedirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=signup`
        : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: emailRedirectUrl,
        },
      });

      if (error) {
        throw error;
      }

      // Check if user already exists (Supabase returns fake user with empty identities when user enumeration protection is enabled)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setErrorMsg('An account with this email address already exists. Please sign in instead.');
        return;
      }

      // Check if session was auto-confirmed (if email confirmation is turned off in Supabase)
      if (data.session && (data.user?.email_confirmed_at || data.user?.confirmed_at)) {
        grantAccessAndRedirect('Account created and verified! Redirecting to dashboard...');
        return;
      }

      // User created and verification link dispatched: show "Check your email" screen
      setAuthMode('check-email');
      setOtpType('signup');
      setCooldown(60);
      setSuccessMsg(`We've sent a verification link to ${cleanEmail}. Please check your email to activate your account.`);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Sign up failed. Please try again.';
      setErrorMsg(rawMsg);
    } finally {
      setLoading(false);
    }
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
        // Intercept unconfirmed email error and display dedicated "Check your email" screen with clear message
        const lowerMsg = error.message.toLowerCase();
        if (lowerMsg.includes('email not confirmed') || lowerMsg.includes('not confirmed') || lowerMsg.includes('unconfirmed')) {
          setAuthMode('check-email');
          setOtpType('signup');
          setErrorMsg('');
          setSuccessMsg('');
          return;
        }
        throw new Error(error.message || 'Invalid email or password.');
      }

      if (data.user) {
        // Verify user email confirmation status
        const isEmailVerified = Boolean(
          data.user.email_confirmed_at || data.user.confirmed_at || data.user.app_metadata?.provider !== 'email'
        );

        if (!isEmailVerified) {
          setAuthMode('check-email');
          setOtpType('signup');
          return;
        }

        grantAccessAndRedirect('Authenticated successfully! Redirecting...');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Resend Verification Link from "Check your email" screen
  const handleResendVerificationLink = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please specify your email address.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    setResendingLink(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const emailRedirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=signup`
        : undefined;

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: emailRedirectUrl,
        },
      });

      if (error) {
        throw error;
      }

      setCooldown(60);
      setSuccessMsg(`A fresh verification link has been sent to ${cleanEmail}. Please check your inbox!`);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to resend verification link. Please try again shortly.'
      );
    } finally {
      setResendingLink(false);
    }
  };

  // Send 6-Digit OTP via Supabase Auth
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address to receive a 6-digit code.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    setSendingOtp(true);
    try {
      const emailRedirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: emailRedirectUrl,
        },
      });

      if (error) {
        throw error;
      }

      setOtpStep('verify');
      setCooldown(60);
      setPin(['', '', '', '', '', '']);
      setSuccessMsg(`A 6-digit verification code has been sent to ${cleanEmail}. Check your inbox!`);
      
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send OTP. Please check the email and try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  // 6-Digit OTP Verification Handler with resilient multi-type fallback
  const handleVerifyOtp = async (tokenToVerify?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const token = (tokenToVerify || pin.join('')).trim();

    if (!cleanEmail) {
      setErrorMsg('Please provide your registered email.');
      return;
    }

    if (!token || token.length < 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      return;
    }

    setLoading(true);
    try {
      let { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: token,
        type: otpType,
      });

      if (error && (otpType as string) !== 'signup') {
        const fallback1 = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token,
          type: 'signup',
        });
        if (!fallback1.error) {
          data = fallback1.data;
          error = null;
        }
      }

      if (error && (otpType as string) !== 'email') {
        const fallback2 = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token,
          type: 'email',
        });
        if (!fallback2.error) {
          data = fallback2.data;
          error = null;
        }
      }

      if (error && (otpType as string) !== 'magiclink') {
        const fallback3 = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token,
          type: 'magiclink',
        });
        if (!fallback3.error) {
          data = fallback3.data;
          error = null;
        }
      }

      if (error) {
        throw error;
      }

      if (data?.session || data?.user) {
        if (otpType === 'recovery') {
          grantAccessAndRedirect('Recovery code verified! Redirecting to set new password...', '/reset-password');
        } else {
          grantAccessAndRedirect('Email verified and authenticated! Redirecting to dashboard...');
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Invalid or expired code. Please verify the 6-digit OTP and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle PIN input changes
  const handlePinChange = (index: number, val: string) => {
    const sanitized = val.replace(/\D/g, '');
    if (!sanitized) {
      const newPin = [...pin];
      newPin[index] = '';
      setPin(newPin);
      return;
    }

    const digit = sanitized.slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const completeToken = newPin.join('');
    if (completeToken.length === 6 && newPin.every((d) => d !== '')) {
      handleVerifyOtp(completeToken);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        const newPin = [...pin];
        newPin[index - 1] = '';
        setPin(newPin);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newPin = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedData.length; i++) {
      newPin[i] = pastedData[i];
    }
    setPin(newPin);

    const targetIndex = Math.min(pastedData.length, 5);
    inputRefs.current[targetIndex]?.focus();

    if (pastedData.length === 6) {
      handleVerifyOtp(pastedData);
    }
  };

  // Send Password Reset Modal Handler
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
        <div className="bg-slate-900 text-white w-full md:w-64 p-8 flex flex-col justify-between flex-shrink-0">
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
          
          {/* Header Title depending on Mode */}
          {authMode !== 'check-email' && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {authMode === 'signup' ? 'Create Account' : 'Admin Portal'}
                </h2>
                <p className="text-xs text-slate-500">
                  {authMode === 'signup'
                    ? 'Sign up to register your shop and start billing'
                    : 'Sign in to access your shop dashboard'}
                </p>
              </div>

              {/* Mode switch button */}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1"
              >
                {authMode === 'signin' ? (
                  <>
                    <UserPlus size={13} />
                    <span>Sign Up</span>
                  </>
                ) : (
                  <>
                    <LogIn size={13} />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Flow Toggle Tabs for Sign In */}
          {authMode === 'signin' && (
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
          )}

          {/* Exchanging code loading banner */}
          {exchangingCode && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg flex items-center space-x-2 text-blue-800 text-xs font-semibold animate-pulse">
              <Loader2 size={16} className="animate-spin text-blue-600 flex-shrink-0" />
              <span>Authenticating via secure link... Please wait.</span>
            </div>
          )}

          {/* Alerts */}
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg flex items-start space-x-2 text-rose-800 text-xs">
              <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Notice</span>
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

          {/* ======================================================== */}
          {/* VIEW 1: CHECK YOUR EMAIL SCREEN */}
          {/* ======================================================== */}
          {authMode === 'check-email' && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="text-center space-y-2 pb-1">
                <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 mb-1">
                  <Mail className="w-7 h-7" />
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border-2 border-white"></span>
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Check your email
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  We&apos;ve sent a verification link to:
                </p>
                <div className="inline-block bg-slate-100 border border-slate-200 px-3 py-1 rounded-full text-xs font-mono font-bold text-slate-800">
                  {email || 'your email'}
                </div>
              </div>

              {/* Clear Requirement Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                  <span>Email Verification Required</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90">
                  Please click the link in your email to verify your account and activate your shop dashboard.
                </p>
              </div>

              {/* Security info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <Clock size={12} className="text-slate-400" />
                  <span>Link Expiration:</span>
                </div>
                <p className="leading-normal">
                  The verification link is single-use, stored hashed, and expires in <strong>24 hours</strong>.
                </p>
              </div>

              {/* Resend button */}
              <button
                type="button"
                onClick={handleResendVerificationLink}
                disabled={resendingLink || cooldown > 0 || !email}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resendingLink ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sending fresh link...</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Clock size={14} />
                    <span>Resend available in {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    <span>Resend Verification Link</span>
                  </>
                )}
              </button>

              {/* Enter 6-digit PIN code section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Or Enter 6-Digit PIN from Email
                  </label>
                </div>
                <div className="flex items-center justify-between gap-1.5">
                  {pin.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(idx, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(idx, e)}
                      onPaste={handlePinPaste}
                      disabled={loading}
                      className={`w-9 h-11 sm:w-10 sm:h-12 text-center font-mono text-lg font-extrabold rounded-lg border transition-all focus:outline-none ${
                        digit
                          ? 'bg-blue-50/50 border-blue-500 text-blue-900 ring-1 ring-blue-500/20'
                          : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-blue-600'
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleVerifyOtp()}
                  disabled={loading || pin.some((d) => d === '')}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-lg transition disabled:opacity-50 mt-2.5 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify &amp; Enter Dashboard</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>

              {/* Navigation Back */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: SIGN UP FORM */}
          {/* ======================================================== */}
          {authMode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="shop.admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Create Password (min. 6 characters)
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-800 flex items-start gap-2">
                <Sparkles size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <span>
                  We will send a 24-hour verification link to your email upon sign-up.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center space-x-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account &amp; Send Verification Link</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                  }}
                  className="text-xs text-slate-500 hover:text-blue-600 font-medium transition"
                >
                  Already registered? <strong className="text-blue-600">Sign in here →</strong>
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* VIEW 3: SIGN IN FORM (PASSWORD LOGIN) */}
          {/* ======================================================== */}
          {authMode === 'signin' && activeTab === 'password' && (
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

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setErrorMsg('');
                  }}
                  className="text-xs text-slate-500 hover:text-blue-600 font-medium transition"
                >
                  Don&apos;t have an account? <strong className="text-blue-600">Create one now →</strong>
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* VIEW 4: SIGN IN FORM (6-DIGIT OTP) */}
          {/* ======================================================== */}
          {authMode === 'signin' && activeTab === 'otp' && (
            <div className="space-y-4">
              {otpStep === 'request' && (
                <form onSubmit={handleSendOtp} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Registered Email Address
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
                    <p className="text-[11px] text-slate-400 mt-1">
                      We will send a one-time 6-digit confirmation PIN to your inbox.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingOtp || !email.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center space-x-2"
                  >
                    {sendingOtp ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Sending 6-Digit OTP...</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>Send 6-Digit OTP</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setOtpStep('verify')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition"
                    >
                      Already have a 6-digit code? Enter PIN directly →
                    </button>
                  </div>
                </form>
              )}

              {otpStep === 'verify' && (
                <form onSubmit={(e) => handleVerifyOtp(undefined, e)} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 truncate max-w-[200px] sm:max-w-xs">
                      <Mail size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="font-semibold truncate">{email || 'your email'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('request');
                        setErrorMsg('');
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition"
                    >
                      <ArrowLeft size={12} />
                      <span>Change Email</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Enter 6-Digit PIN
                      </label>
                      <select
                        value={otpType}
                        onChange={(e) => setOtpType(e.target.value as 'signup' | 'magiclink' | 'recovery' | 'email')}
                        className="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 font-medium"
                      >
                        <option value="signup">Signup Confirmation</option>
                        <option value="email">Email OTP / Signin</option>
                        <option value="magiclink">Magic Link Token</option>
                        <option value="recovery">Password Recovery</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                      {pin.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            inputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handlePinChange(idx, e.target.value)}
                          onKeyDown={(e) => handlePinKeyDown(idx, e)}
                          onPaste={handlePinPaste}
                          disabled={loading}
                          className={`w-10 h-12 sm:w-12 sm:h-13 text-center font-mono text-xl font-extrabold rounded-xl border transition-all duration-150 focus:outline-none ${
                            digit
                              ? 'bg-blue-50/50 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500/20'
                              : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-500">
                      <span>Type or paste 6 digits</span>
                      {cooldown > 0 ? (
                        <span className="text-slate-400 font-mono font-medium">
                          Resend in {cooldown}s
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendOtp()}
                          disabled={sendingOtp}
                          className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition"
                        >
                          <RefreshCw size={11} className={sendingOtp ? 'animate-spin' : ''} />
                          <span>Resend OTP</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || pin.some((d) => d === '')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-1 flex items-center justify-center space-x-1.5"
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
            </div>
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
