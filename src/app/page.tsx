'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { DashboardStats, Bill } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { InvoiceModal } from '@/components/InvoiceModal';
import { 
  IndianRupee, 
  Receipt, 
  Users, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  Eye, 
  Package, 
  DollarSign 
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todays_sales: 0,
    todays_bills_count: 0,
    pending_balance: 0,
    total_customers: 0,
    total_income: 0,
    total_expense: 0,
    net_profit: 0
  });
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getDashboardStats();
      setStats(data);
      const bills = await ApiService.getBills();
      setRecentBills(bills.slice(0, 8)); // Display 8 most recent
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewBill = async (billId: string) => {
    const fullBill = await ApiService.getBillById(billId);
    if (fullBill) {
      setSelectedBill(fullBill);
    }
  };

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Business Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Xerox & Stationery Shop Daily Summary</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/billing"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
          >
            <PlusCircle size={18} />
            <span>Create Bill</span>
          </Link>
          <Link
            href="/products"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold px-3.5 py-2.5 rounded-lg border border-slate-200 transition flex items-center space-x-1.5"
          >
            <Package size={16} />
            <span>Products</span>
          </Link>
          <Link
            href="/customers"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold px-3.5 py-2.5 rounded-lg border border-slate-200 transition flex items-center space-x-1.5"
          >
            <Users size={16} />
            <span>Customers</span>
          </Link>
        </div>
      </div>

      {/* STAT CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today&apos;s Sales</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">₹{stats.todays_sales.toFixed(2)}</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100">
            <IndianRupee size={24} />
          </div>
        </div>

        {/* Today's Bills */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today&apos;s Bills</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats.todays_bills_count}</p>
          </div>
          <div className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100">
            <Receipt size={24} />
          </div>
        </div>

        {/* Pending Balance */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Balance</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">₹{stats.pending_balance.toFixed(2)}</p>
          </div>
          <div className="bg-amber-50 text-amber-600 p-3 rounded-xl border border-amber-100">
            <AlertCircle size={24} />
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Customers</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats.total_customers}</p>
          </div>
          <div className="bg-purple-50 text-purple-600 p-3 rounded-xl border border-purple-100">
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* FINANCIAL SUMMARY & PROFIT BAR */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-lg border border-emerald-500/30">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Total Income</p>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">₹{stats.total_income.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-rose-500/20 text-rose-400 p-3 rounded-lg border border-rose-500/30">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Total Expenses</p>
            <p className="text-xl font-bold text-rose-400 mt-0.5">₹{stats.total_expense.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase">Net Profit</p>
            <p className={`text-2xl font-extrabold mt-0.5 ${stats.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ₹{stats.net_profit.toFixed(2)}
            </p>
          </div>
          <Link
            href="/expenses"
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline flex items-center space-x-1"
          >
            <DollarSign size={14} />
            <span>Manage</span>
          </Link>
        </div>
      </div>

      {/* RECENT BILLS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
            <Receipt className="text-blue-600" size={20} />
            <span>Recent Bills</span>
          </h2>
          <Link href="/billing" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            + Create New Bill
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading recent bills...</div>
        ) : recentBills.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Receipt className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="font-medium text-base text-slate-700">No bills available.</p>
            <p className="text-xs text-slate-400 mt-1">Start by creating your first bill for Xerox or Stationery items.</p>
            <Link
              href="/billing"
              className="inline-flex items-center space-x-1.5 mt-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow"
            >
              <PlusCircle size={14} />
              <span>Create Bill Now</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                  <th className="px-6 py-3">Bill No</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Payment Method</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-3.5 font-mono font-bold text-slate-900">{bill.bill_number}</td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">
                      {new Date(bill.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-3.5 font-medium">{bill.customer_name}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        bill.payment_method === 'Cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : bill.payment_method === 'UPI'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {bill.payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-extrabold text-slate-900">
                      ₹{Number(bill.grand_total).toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <button
                        onClick={() => handleViewBill(bill.id)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded font-semibold transition flex items-center space-x-1 mx-auto border border-slate-200"
                      >
                        <Eye size={14} />
                        <span>View / Print</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {selectedBill && (
        <InvoiceModal bill={selectedBill} onClose={() => setSelectedBill(null)} />
      )}
    </div>
  );
}
