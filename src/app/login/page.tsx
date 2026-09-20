'use client';

import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { Printer, Lock, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const grantAccessAndRedirect = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      window.location.href = '/';
    }, 400);
  };

  const handleLogin = async (e: React.FormEvent) => {
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
        password: cleanPassword
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

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Two-column card: brand left, form right */}
      <div className="max-w-2xl w-full flex flex-col md:flex-row rounded-2xl shadow-2xl overflow-hidden border border-slate-200">

        {/* LEFT — Brand panel */}
        <div className="bg-slate-900 text-white w-full md:w-56 p-8 flex flex-col justify-between flex-shrink-0">
          <div>
            <div className="inline-flex bg-blue-600/20 border border-blue-500/30 text-blue-300 p-3 rounded-xl mb-6">
              <Printer size={28} />
            </div>
            <h1 className="text-lg font-extrabold leading-tight text-white">PrintPro ERP</h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">Xerox &amp; Stationery Management System</p>
          </div>
          <div className="hidden md:block space-y-3 text-[11px] text-slate-500 mt-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              Billing &amp; Single-Page PDF
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
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-lg flex items-center space-x-2.5 text-emerald-800 text-xs font-semibold">
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
                  placeholder="admin123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-lg shadow-md transition-colors disabled:opacity-50 mt-2 flex items-center justify-center space-x-1.5"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            </button>
          </form>

          <div className="pt-1 text-center border-t border-slate-100 text-[10px] text-slate-400 font-data-mono">
            PRINTPRO ERP • ACCESS GUARD
          </div>
        </div>
      </div>
    </div>
  );
}
