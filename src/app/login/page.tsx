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
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex bg-blue-600 text-white p-3 rounded-2xl shadow-md">
            <Printer size={32} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Admin Login</h2>
          <p className="text-xs text-slate-500">Xerox & Stationery Billing Management</p>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-r-lg flex items-center space-x-2.5 text-rose-800 text-xs">
            <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-lg flex items-center space-x-2.5 text-emerald-800 text-xs">
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                placeholder="admin@shop.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm py-3 rounded-lg shadow-md transition disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In as Admin'}
          </button>
        </form>

        <div className="pt-2 text-center border-t border-slate-100 text-[11px] text-slate-400">
          Single Admin Access Guard • Xerox & Stationery Billing System
        </div>
      </div>
    </div>
  );
}
