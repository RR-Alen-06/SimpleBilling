'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Receipt, 
  Package, 
  Users, 
  DollarSign, 
  BarChart3, 
  Settings as SettingsIcon,
  FileText,
  Menu, 
  X, 
  Printer,
  Database
} from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Create Bill', href: '/billing', icon: Receipt },
    { label: 'Products', href: '/products', icon: Package },
    { label: 'Customers', href: '/customers', icon: Users },
    { label: 'Manage Bills', href: '/bills', icon: FileText },
    { label: 'Expenses', href: '/expenses', icon: DollarSign },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
    { label: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              aria-label="Toggle Navigation Menu"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <Link href="/" className="flex items-center space-x-2 text-xl font-bold tracking-tight text-white">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Printer size={22} />
              </div>
              <div className="flex flex-col">
                <span className="leading-none text-base sm:text-lg">PrintPro ERP</span>
                <span className="text-[10px] text-blue-400 font-normal leading-none mt-0.5">Xerox & Stationery POS</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            {!isSupabaseConfigured && (
              <span className="hidden sm:flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Database size={14} />
                <span>Supabase Not Connected</span>
              </span>
            )}
            <Link 
              href="/billing" 
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg shadow-sm transition flex items-center space-x-1.5"
            >
              <Receipt size={16} />
              <span>+ New Bill</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Navigation Bar */}
      <nav className="bg-slate-800 text-slate-200 border-b border-slate-700 hidden lg:block print:hidden shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3.5 py-3 text-xs font-semibold transition border-b-2 ${
                  isActive
                    ? 'border-blue-400 text-white bg-slate-900/60'
                    : 'border-transparent text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm lg:hidden print:hidden" onClick={() => setMobileOpen(false)}>
          <div 
            className="fixed top-0 left-0 bottom-0 w-3/4 max-w-xs bg-slate-900 text-slate-100 p-5 shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div className="flex items-center space-x-2 font-bold text-lg">
                  <Printer className="text-blue-400" size={20} />
                  <span>PrintPro ERP</span>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1 rounded text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 text-center">
              PrintPro ERP Billing System
            </div>
          </div>
        </div>
      )}
    </>
  );
}
