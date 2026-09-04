'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { CustomerSummary, Payment } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  CreditCard, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Wallet, 
  BookOpen, 
  Receipt, 
  Clock, 
  History 
} from 'lucide-react';

function PaymentsContent() {
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get('customerId') || '';

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  const [loading, setLoading] = useState(true);

  // Form State
  const [cashAmount, setCashAmount] = useState<number | ''>('');
  const [upiAmount, setUpiAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Feedback State
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [custList, payList] = await Promise.all([
        ApiService.getCustomerSummaries(),
        ApiService.getPayments()
      ]);
      setCustomers(custList);
      setPayments(payList);
    } catch (err) {
      console.error('Failed to load payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  useEffect(() => {
    if (initialCustomerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const cashVal = Number(cashAmount || 0);
  const upiVal = Number(upiAmount || 0);
  const totalEntered = cashVal + upiVal;

  const handleQuickFillDue = (mode: 'cash' | 'upi') => {
    if (!selectedCustomer) return;
    const due = Math.max(0, selectedCustomer.balance_due);
    if (mode === 'cash') {
      setCashAmount(due);
      setUpiAmount('');
    } else {
      setUpiAmount(due);
      setCashAmount('');
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCustomer) {
      setErrorMsg('Please select a customer.');
      return;
    }

    if (totalEntered <= 0) {
      setErrorMsg('Please enter a valid payment amount (Cash or UPI).');
      return;
    }

    setSubmitting(true);
    try {
      // Record Cash payment if entered
      if (cashVal > 0) {
        await ApiService.recordCustomerPayment({
          customer_id: selectedCustomer.id,
          amount: cashVal,
          payment_method: 'Cash',
          notes: notes.trim() || 'Standalone Cash Payment Collection'
        });
      }

      // Record UPI payment if entered
      if (upiVal > 0) {
        await ApiService.recordCustomerPayment({
          customer_id: selectedCustomer.id,
          amount: upiVal,
          payment_method: 'UPI',
          notes: notes.trim() || 'Standalone UPI Payment Collection'
        });
      }

      setSuccessMsg(`Successfully collected ₹${totalEntered.toFixed(2)} from ${selectedCustomer.name}!`);
      setCashAmount('');
      setUpiAmount('');
      setNotes('');
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to collect payment');
    } finally {
      setSubmitting(false);
    }
  };

  // Customers with pending dues
  const customersWithDues = customers.filter(c => c.balance_due > 0);

  // Filtered payments list
  const filteredPayments = payments.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      (p.payment_number && p.payment_number.toLowerCase().includes(term)) ||
      (p.customer_name && p.customer_name.toLowerCase().includes(term)) ||
      (p.payment_method && p.payment_method.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <CreditCard className="text-emerald-600" size={26} />
            <span>Payment Collection</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Collect dues, settle pending balances, or receive advance payments from customers
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            href="/customers"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5"
          >
            <Users size={15} />
            <span>Customer Directory</span>
          </Link>
          <Link
            href="/bills"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5"
          >
            <Receipt size={15} />
            <span>Manage Bills</span>
          </Link>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg flex items-center space-x-2 text-rose-800 text-xs font-medium">
          <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-center space-x-2 text-emerald-800 text-xs font-medium">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* MAIN TWO COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: COLLECTION FORM (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center space-x-2">
              <Wallet className="text-blue-600" size={18} />
              <span>Collect Customer Payment</span>
            </h2>

            <form onSubmit={handleCollectPayment} className="space-y-4">
              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Customer *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose Customer --</option>
                  {customersWithDues.length > 0 && (
                    <optgroup label="⚠️ Customers With Pending Dues">
                      {customersWithDues.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.mobile ? `(${c.mobile})` : ''} — Due: ₹{c.balance_due.toFixed(2)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All Other Customers">
                    {customers.filter(c => c.balance_due <= 0).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.advance_balance > 0 ? `(Advance: ₹${c.advance_balance.toFixed(2)})` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Customer Balance Summary Card */}
              {selectedCustomer && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-slate-900 text-sm">{selectedCustomer.name}</span>
                    <Link
                      href={`/customers/${selectedCustomer.id}`}
                      className="text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1"
                    >
                      <BookOpen size={12} />
                      <span>View Full Ledger</span>
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Total Billed:</span>
                      <span className="font-bold text-slate-800">₹{selectedCustomer.total_billed.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Paid:</span>
                      <span className="font-bold text-emerald-700">₹{selectedCustomer.total_paid.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Current Balance Due:</span>
                      <span className={`font-extrabold text-sm ${selectedCustomer.balance_due > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                        ₹{selectedCustomer.balance_due.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Customer Advance:</span>
                      <span className="font-bold text-blue-700">₹{selectedCustomer.advance_balance.toFixed(2)}</span>
                    </div>
                  </div>

                  {selectedCustomer.balance_due > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Quick Settle:</span>
                      <button
                        type="button"
                        onClick={() => handleQuickFillDue('cash')}
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] transition"
                      >
                        ⚡ Settle Cash (₹{selectedCustomer.balance_due.toFixed(2)})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickFillDue('upi')}
                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded text-[10px] transition"
                      >
                        ⚡ Settle UPI (₹{selectedCustomer.balance_due.toFixed(2)})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Split Inputs */}
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cash Received (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      UPI Received (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={upiAmount}
                      onChange={(e) => setUpiAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Total Payment Feedback */}
                <div className="flex justify-between items-center p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs">
                  <span className="font-semibold text-emerald-900">Total Payment Amount:</span>
                  <span className="font-extrabold text-emerald-800 text-base">₹{totalEntered.toFixed(2)}</span>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Payment Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GPay ref #123456 or Partial Xerox settlement"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || totalEntered <= 0 || !selectedCustomerId}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-lg shadow-md transition flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 size={18} />
                  <span>{submitting ? 'Recording Payment...' : `Record Payment (₹${totalEntered.toFixed(2)})`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: RECENT PAYMENTS LOG & PENDING CUSTOMERS (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <History className="text-slate-600" size={20} />
                <h2 className="text-base font-bold text-slate-900">Recent Payment Transactions</h2>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search receipt, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 w-48 sm:w-56"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading transaction history...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <Clock className="mx-auto text-slate-300 mb-2" size={32} />
                <p>No payment records found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3">Receipt No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.slice(0, 15).map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {pay.payment_number || 'PAY-N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {new Date(pay.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {pay.customer_name || 'Customer'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            pay.payment_method === 'Cash'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {pay.payment_method}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 font-mono">
                          ₹{Number(pay.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading payment module...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}
