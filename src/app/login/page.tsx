'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { Printer, Lock, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isSupabaseConfigured) {
      // Local fallback sign-in
      if (email === 'admin@shop.com' && password === 'admin123') {
        setSuccessMsg('Logged in as Admin successfully.');
        setTimeout(() => router.push('/'), 1000);
      } else {
        setErrorMsg('Invalid login credentials. Default fallback: admin@shop.com / admin123');
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        // Try sign-up if first time admin initialization
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password
        });
        if (signUpErr) throw new Error(error.message);
        if (signUpData.user) {
          setSuccessMsg('Admin account initialized. Logging in...');
          setTimeout(() => router.push('/'), 1000);
          return;
        }
      }

      if (data.user) {
        setSuccessMsg('Authenticated successfully!');
        setTimeout(() => router.push('/'), 800);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Two-column card: brand left, form right */}
      <div className="max-w-2xl w-full flex rounded-2xl shadow-2xl overflow-hidden border border-slate-200">

        {/* LEFT — Brand panel */}
        <div className="hidden md:flex flex-col justify-between bg-slate-900 text-white w-56 p-8 flex-shrink-0">
          <div>
            <div className="inline-flex bg-blue-600/20 border border-blue-500/30 text-blue-300 p-3 rounded-xl mb-6">
              <Printer size={28} />
            </div>
            <h1 className="text-lg font-extrabold leading-tight text-white">SimBilling</h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">Xerox &amp; Stationery Management System</p>
          </div>
          <div className="space-y-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              Billing &amp; POS
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
              Customer Ledgers
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block"></span>
              Reports &amp; Audit
            </div>
          </div>
        </div>

        {/* RIGHT — Form panel */}
        <div className="flex-1 bg-white p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Admin Sign In</h2>
            <p className="text-xs text-slate-500">Enter your credentials to access the dashboard</p>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-r-lg flex items-center space-x-2.5 text-rose-800 text-xs">
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-lg flex items-center space-x-2.5 text-emerald-800 text-xs">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="admin@shop.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-1 text-center border-t border-slate-100 text-[10px] text-slate-400 font-data-mono">
            SINGLE ADMIN ACCESS GUARD • SIMBILLING v1.0
          </div>
        </div>
      </div>
    </div>
  );
}
