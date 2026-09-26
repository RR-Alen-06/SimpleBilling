'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { CustomerSummary, Payment } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { PaymentReceiptModal } from '@/components/PaymentReceiptModal';
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
  History,
  Eye,
  RotateCcw,
  Trash2,
  RefreshCw,
  X
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
  const [reconciling, setReconciling] = useState(false);

  // Reversal / Delete Modal State
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletePin, setDeletePin] = useState('');
  const [override48h, setOverride48h] = useState(false);

  // Receipt Modal State
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<Payment | null>(null);

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

  const handleOpenDeletePayment = (payment: Payment) => {
    setDeletingPayment(payment);
    setDeleteReason('Accidental payment entry / payment not received');
    setDeletePin('');
    setOverride48h(false);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleDeletePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!deletingPayment) return;

    if (!deleteReason.trim()) {
      setErrorMsg('Please state a reason for deleting/reversing this payment.');
      return;
    }

    const isPast48h = (Date.now() - new Date(deletingPayment.created_at).getTime()) > 48 * 3600 * 1000;
    if (isPast48h && !override48h) {
      setErrorMsg('This payment is older than 48 hours. Please check the Super Admin 48-Hour Override box to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.deletePayment(
        deletingPayment.id,
        deleteReason.trim(),
        deletePin,
        'Super Admin',
        override48h
      );
      await ApiService.reconcileCustomerAdvanceBalances('Super Admin');
      setSuccessMsg(`Payment ${deletingPayment.payment_number || ''} (₹${deletingPayment.amount}) was deleted and customer ledger updated.`);
      setDeletingPayment(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcileBalances = async () => {
    setReconciling(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await ApiService.reconcileCustomerAdvanceBalances('Super Admin');
      setSuccessMsg(`Reconciliation complete: checked ${res.customersReconciled} customers, fixed ${res.discrepanciesFixed} balance discrepancies.`);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reconcile balances');
    } finally {
      setReconciling(false);
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

  // Live Allocation Calculations
  const currentBalanceDue = selectedCustomer ? Math.max(0, selectedCustomer.balance_due) : 0;
  const duesSettled = Math.min(currentBalanceDue, totalEntered);
  const advanceCredited = Math.max(0, totalEntered - currentBalanceDue);
  const remainingDueAfter = Math.max(0, currentBalanceDue - totalEntered);
  const newAdvanceBalance = selectedCustomer ? Number(selectedCustomer.advance_balance || 0) + advanceCredited : advanceCredited;

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
      // Construct structured allocation note
      let allocNote = '';
      if (duesSettled > 0 && advanceCredited > 0) {
        allocNote = `[Dues Settled: ₹${duesSettled.toFixed(2)} | Advance Credited: ₹${advanceCredited.toFixed(2)}]`;
      } else if (advanceCredited > 0) {
        allocNote = `[Advance Credited: ₹${advanceCredited.toFixed(2)}]`;
      } else if (duesSettled > 0) {
        allocNote = `[Dues Settled: ₹${duesSettled.toFixed(2)}]`;
      }

      const combinedNotes = notes.trim() 
        ? `${notes.trim()} ${allocNote}` 
        : allocNote || 'Direct Payment Collection';

      let lastRecordedPayment: Payment | null = null;

      // Record Cash payment if entered
      if (cashVal > 0) {
        lastRecordedPayment = await ApiService.recordCustomerPayment({
          customer_id: selectedCustomer.id,
          amount: cashVal,
          payment_method: 'Cash',
          notes: combinedNotes
        });
      }

      // Record UPI payment if entered
      if (upiVal > 0) {
        lastRecordedPayment = await ApiService.recordCustomerPayment({
          customer_id: selectedCustomer.id,
          amount: upiVal,
          payment_method: 'UPI',
          notes: combinedNotes
        });
      }

      let msg = `Successfully collected ₹${totalEntered.toFixed(2)} from ${selectedCustomer.name}!`;
      if (duesSettled > 0 && advanceCredited > 0) {
        msg += ` (₹${duesSettled.toFixed(2)} Dues Cleared + ₹${advanceCredited.toFixed(2)} Advance Added)`;
      } else if (advanceCredited > 0) {
        msg += ` (+₹${advanceCredited.toFixed(2)} Added to Advance Balance)`;
      }
      setSuccessMsg(msg);
      
      setCashAmount('');
      setUpiAmount('');
      setNotes('');
      await loadData();

      // Automatically offer payment voucher
      if (lastRecordedPayment) {
        setSelectedPaymentForReceipt(lastRecordedPayment);
      }
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
      (p.payment_method && p.payment_method.toLowerCase().includes(term)) ||
      (p.notes && p.notes.toLowerCase().includes(term))
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
            Collect dues, settle pending balances, or receive advance payments with automatic allocation
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <button
            onClick={handleReconcileBalances}
            disabled={reconciling}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
            title="Reconcile and sync customer advance balances with transaction records"
          >
            <RefreshCw size={14} className={reconciling ? 'animate-spin' : ''} />
            <span>{reconciling ? 'Reconciling...' : 'Reconcile Balances'}</span>
          </button>
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
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] transition cursor-pointer"
                      >
                        ⚡ Settle Cash (₹{selectedCustomer.balance_due.toFixed(2)})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickFillDue('upi')}
                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded text-[10px] transition cursor-pointer"
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
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="font-semibold text-slate-700">Total Payment Entered:</span>
                  <span className="font-extrabold text-slate-900 text-base font-mono">₹{totalEntered.toFixed(2)}</span>
                </div>

                {/* LIVE PAYMENT ALLOCATION PREVIEW CARD */}
                {selectedCustomer && totalEntered > 0 && (
                  <div className="bg-gradient-to-br from-purple-50/70 via-indigo-50/50 to-blue-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-2.5 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5">
                      <span className="font-bold text-indigo-950 uppercase tracking-wider text-[10px] flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block animate-pulse"></span>
                        <span>Live Allocation Breakdown</span>
                      </span>
                      <span className="font-extrabold text-indigo-900 font-mono text-xs">
                        ₹{totalEntered.toFixed(2)} Received
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {/* Case 1: Dues Settled */}
                      <div className="flex justify-between items-center bg-white/90 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                        <span className="text-slate-700 font-medium flex items-center space-x-1.5">
                          <span className={`w-2 h-2 rounded-full ${duesSettled > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                          <span>Applied to Clear Bill Dues:</span>
                        </span>
                        <span className="font-bold text-emerald-700 font-mono">
                          ₹{duesSettled.toFixed(2)}
                        </span>
                      </div>

                      {/* Case 2: Advance Credited (Excess Payment) */}
                      {advanceCredited > 0 && (
                        <div className="flex justify-between items-center bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200">
                          <span className="text-indigo-900 font-bold flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            <span>Added to Customer Advance:</span>
                          </span>
                          <span className="font-extrabold text-indigo-700 font-mono">
                            +₹{advanceCredited.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Resulting Ledger Projection */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-100/80 text-[11px] text-center">
                      <div className="bg-white/90 p-1.5 rounded-lg border border-slate-200/70">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">New Due Balance</span>
                        <span className={`font-extrabold ${remainingDueAfter > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          ₹{remainingDueAfter.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-white/90 p-1.5 rounded-lg border border-slate-200/70">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">New Advance Balance</span>
                        <span className="font-extrabold text-indigo-700">
                          ₹{newAdvanceBalance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Payment Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GPay ref #123456 or Advance payment"
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
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-lg shadow-md transition flex items-center justify-center space-x-2 cursor-pointer"
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
                      <th className="py-2.5 px-3 text-center w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.slice(0, 20).map((pay) => {
                      const isCancelled = pay.status === 'CANCELLED';
                      const isReversed = pay.status === 'REVERSED';
                      const isInactive = isCancelled || isReversed;

                      const hasAdv = pay.notes?.includes('Advance Credited') || pay.notes?.includes('Advance Payment');
                      const hasDues = pay.notes?.includes('Dues Settled');

                      return (
                        <tr key={pay.id} className={`hover:bg-slate-50/80 transition ${isInactive ? 'bg-slate-50/50 opacity-75' : ''}`}>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            <div className="flex items-center space-x-1.5">
                              <span className={isInactive ? 'line-through text-slate-400' : ''}>
                                {pay.payment_number || 'PAY-N/A'}
                              </span>
                              {isCancelled && (
                                <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-200 uppercase" title={`Cancelled: ${pay.cancellation_reason || 'No reason provided'}`}>
                                  Cancelled
                                </span>
                              )}
                              {isReversed && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase" title={`Reversed: ${pay.cancellation_reason || 'Reversed with Bill'}`}>
                                  Reversed
                                </span>
                              )}
                            </div>
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
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-extrabold font-mono block ${isInactive ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              ₹{Number(pay.amount).toFixed(2)}
                            </span>
                            {hasAdv && !isInactive && (
                              <span className="inline-block bg-indigo-50 text-indigo-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-indigo-100">
                                Advance Credited
                              </span>
                            )}
                            {hasDues && !hasAdv && !isInactive && (
                              <span className="inline-block bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-100">
                                Dues Cleared
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedPaymentForReceipt(pay)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                title="View Payment Voucher Receipt"
                              >
                                <Eye size={15} />
                              </button>
                              {!isInactive ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDeletePayment(pay)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Super Admin: Delete / Reverse Payment Entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : (
                                <span className="p-1.5 text-slate-300 cursor-not-allowed" title={`Already ${isCancelled ? 'Cancelled' : 'Reversed'}: ${pay.cancellation_reason || ''}`}>
                                  <Trash2 size={14} />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DELETE / REVERSE PAYMENT MODAL */}
      {deletingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-rose-700 flex items-center space-x-2">
                <Trash2 className="text-rose-600" size={20} />
                <span>Delete Payment ({deletingPayment.payment_number || 'PAY'})</span>
              </h2>
              <button onClick={() => setDeletingPayment(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg space-y-1 text-xs text-rose-800">
              <span className="font-bold block">Payment Deletion Notice</span>
              <p>Deleting this payment entry will restore the customer&apos;s pending balance due (or deduct any advance that was credited) and update all financial reports accordingly.</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{deletingPayment.customer_name || 'Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-bold text-slate-800">{deletingPayment.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount to Delete:</span>
                <span className="font-mono font-extrabold text-rose-700">₹{Number(deletingPayment.amount).toFixed(2)}</span>
              </div>
            </div>

            {/* 48-HOUR LIMIT WARNING & OVERRIDE */}
            {deletingPayment && ((Date.now() - new Date(deletingPayment.created_at).getTime()) > 48 * 3600 * 1000) && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
                <div className="flex items-start space-x-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">48-Hour Deletion Window Exceeded</span>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      This payment was recorded on {new Date(deletingPayment.created_at).toLocaleString('en-IN')}. Super Admin override is mandatory to cancel past 48 hours.
                    </p>
                  </div>
                </div>

                <label className="flex items-center space-x-2 pt-1 border-t border-amber-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={override48h}
                    onChange={(e) => setOverride48h(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="font-bold text-[11px] text-amber-950">
                    I confirm Super Admin Override for payment older than 48 hours
                  </span>
                </label>
              </div>
            )}

            <form onSubmit={handleDeletePaymentSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Deletion *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Accidental entry / money not received"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Super Admin Security PIN *</label>
                <input
                  type="password"
                  required
                  placeholder="PIN (Default: 1234)"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeletingPayment(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 size={14} className={submitting ? 'animate-spin' : ''} />
                  <span>{submitting ? 'Deleting...' : 'Delete Payment Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Receipt Modal */}
      {selectedPaymentForReceipt && (
        <PaymentReceiptModal
          payment={selectedPaymentForReceipt}
          onClose={() => setSelectedPaymentForReceipt(null)}
        />
      )}
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

