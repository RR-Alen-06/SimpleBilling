'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { Customer, CustomerLedgerEntry, PaymentMethod } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  BookOpen, 
  ArrowLeft, 
  PlusCircle, 
  Phone, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  CreditCard,
  Receipt
} from 'lucide-react';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = use(params);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [totalBilled, setTotalBilled] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [runningBalance, setRunningBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Record Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadLedgerData();
  }, [customerId]);

  const loadLedgerData = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getCustomerLedger(customerId);
      setCustomer(data.customer);
      setEntries(data.entries);
      setTotalBilled(data.totalBilled);
      setTotalPaid(data.totalPaid);
      setRunningBalance(data.runningBalance);
    } catch (err: unknown) {
      console.error('Error loading ledger:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayment = () => {
    setPaymentAmount(runningBalance > 0 ? runningBalance : '');
    setPaymentMethod('Cash');
    setPaymentNotes('');
    setErrorMsg('');
    setShowPaymentModal(true);
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Payment amount must be greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.recordCustomerPayment({
        customer_id: customerId,
        amount: amt,
        payment_method: paymentMethod,
        notes: paymentNotes.trim() || undefined
      });
      setSuccessMsg('Payment recorded successfully.');
      setShowPaymentModal(false);
      loadLedgerData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Top Back Nav & Header */}
      <div className="space-y-4">
        <Link
          href="/customers"
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
        >
          <ArrowLeft size={16} />
          <span>Back to Customers Directory</span>
        </Link>

        {customer && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 text-blue-800 p-2.5 rounded-xl font-bold">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900">{customer.name}</h1>
                  {customer.mobile ? (
                    <p className="text-xs text-slate-500 flex items-center space-x-1 mt-0.5 font-mono">
                      <Phone size={12} />
                      <span>{customer.mobile}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-0.5">No mobile number registered</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Billed</p>
                <p className="text-sm font-bold text-slate-800">₹{totalBilled.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase font-semibold">Total Paid</p>
                <p className="text-sm font-bold text-emerald-600">₹{totalPaid.toFixed(2)}</p>
              </div>
              <div className="text-right bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold">Current Balance Due</p>
                <p className={`text-xl font-extrabold ${runningBalance > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  ₹{runningBalance.toFixed(2)}
                </p>
              </div>
              <button
                onClick={handleOpenPayment}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
              >
                <PlusCircle size={16} />
                <span>Record Payment</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg flex items-center space-x-3 text-rose-800 text-sm">
          <AlertTriangle size={20} className="text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-center space-x-3 text-emerald-800 text-sm">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* LEDGER TIMELINE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
            <BookOpen className="text-blue-600" size={20} />
            <span>Customer Ledger History</span>
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Calculating running ledger balance...</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Receipt className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="font-medium text-base text-slate-700">No ledger entries recorded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Bills and payments for this customer will automatically update the running balance timeline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                  <th className="px-6 py-3.5">Date & Time</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Reference No</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5 text-right">Bill Amount (₹)</th>
                  <th className="px-6 py-3.5 text-right">Paid Amount (₹)</th>
                  <th className="px-6 py-3.5 text-right">Running Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {new Date(entry.date).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        entry.type === 'BILL'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{entry.reference_no}</td>
                    <td className="px-6 py-4 text-xs text-slate-600">{entry.description}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-800">
                      {entry.bill_amount > 0 ? `₹${entry.bill_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-700">
                      {entry.paid_amount > 0 ? `₹${entry.paid_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                      ₹{entry.running_balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <CreditCard className="text-emerald-600" size={20} />
                <span>Record Customer Payment</span>
              </h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="Enter amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Card'] as PaymentMethod[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMethod(mode)}
                      className={`py-2 rounded-lg text-xs font-bold border transition ${
                        paymentMethod === mode
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Received partial cash against pending balance"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
