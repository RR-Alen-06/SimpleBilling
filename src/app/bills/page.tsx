'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { AccountingStatementGenerator } from '@/lib/services/accountingStatementGenerator';
import { Bill, AllSettings, AccountingClosing, DateFilterOption } from '@/lib/types';
import { BILLS_DATE_FILTER_BUTTONS } from '@/lib/constants/filters';
import {
  matchesSessionOrDateFilter,
  getBillSessionInfo,
  formatClosingOptionLabel,
  getPeriodDisplayLabel
} from '@/lib/utils/sessionFilter';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { InvoiceModal } from '@/components/InvoiceModal';
import { EditBillModal } from '@/components/EditBillModal';
import { 
  FileText, 
  Search, 
  Eye, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Clock,
  CreditCard,
  RotateCcw,
  RefreshCw,
  Wallet,
  Loader2,
  Calendar,
  Filter
} from 'lucide-react';

export default function ManageBillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [closings, setClosings] = useState<AccountingClosing[]>([]);
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('current_session');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'pay_later'>('all');
  const [selectedClosingId, setSelectedClosingId] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  // Settle Due Modal State
  const [settlingBill, setSettlingBill] = useState<Bill | null>(null);
  const [settleMethod, setSettleMethod] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [settleCash, setSettleCash] = useState<number | ''>('');
  const [settleUpi, setSettleUpi] = useState<number | ''>('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settling, setSettling] = useState(false);

  // Edit Bill Modal
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  // Reverse Payment Modal
  const [reversingBill, setReversingBill] = useState<Bill | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversePin, setReversePin] = useState('');
  const [override48h, setOverride48h] = useState(false);
  const [isReversalPastLimit, setIsReversalPastLimit] = useState(false);
  const [refundAdvanceToWallet, setRefundAdvanceToWallet] = useState(false);

  // Allocate Advance Modal State
  const [allocatingBill, setAllocatingBill] = useState<Bill | null>(null);
  const [customerAdvance, setCustomerAdvance] = useState(0);
  const [allocateAmount, setAllocateAmount] = useState<number | ''>('');
  const [allocating, setAllocating] = useState(false);
  const [loadingCustAdvance, setLoadingCustAdvance] = useState(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const handleOpenAllocateAdvance = async (bill: Bill) => {
    if (!bill.customer_id) return;
    setAllocatingBill(bill);
    setErrorMsg('');
    setSuccessMsg('');
    setLoadingCustAdvance(true);
    try {
      const customers = await ApiService.getCustomers();
      const cust = customers.find(c => c.id === bill.customer_id);
      const adv = Number(cust?.advance_balance || 0);
      setCustomerAdvance(adv);
      const remainingDue = Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0));
      setAllocateAmount(adv > 0 ? Number(Math.min(adv, remainingDue).toFixed(2)) : '');
    } catch (err) {
      console.error(err);
      setCustomerAdvance(0);
    } finally {
      setLoadingCustAdvance(false);
    }
  };

  const handleAllocateAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingBill) return;
    const amt = Number(allocateAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Please enter a valid amount greater than ₹0.00');
      return;
    }
    setAllocating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await ApiService.applyAdvanceToBill(allocatingBill.id, amt, 'Admin');
      setSuccessMsg(`Successfully allocated ₹${res.allocated.toFixed(2)} advance to ${res.billNumber}. Remaining bill due: ₹${res.newBillDue.toFixed(2)}, Remaining customer advance: ₹${res.remainingAdvance.toFixed(2)}.`);
      setAllocatingBill(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to allocate advance');
    } finally {
      setAllocating(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [billsData, settingsData, closingsData] = await Promise.all([
        ApiService.getBills(),
        ApiService.getSettings(),
        ApiService.getAccountingClosings()
      ]);
      setBills(billsData);
      setSettings(settingsData);
      setClosings(closingsData || []);
    } catch (err) {
      console.error('Error fetching bills & settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEdit = async (bill: Bill) => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const fullBill = await ApiService.getBillById(bill.id);
      setEditingBill(fullBill || bill);
    } catch (err) {
      console.error('Failed to load bill for editing:', err);
      setEditingBill(bill);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReversePayment = (bill: Bill) => {
    setReversingBill(bill);
    setReverseReason('Accidentally recorded payment when no funds received');
    setReversePin('');
    setOverride48h(false);
    setRefundAdvanceToWallet(false);
    const reversalWindowHours = Number(settings?.security?.payment_reversal_window_hours) || 72;
    setIsReversalPastLimit((Date.now() - new Date(bill.created_at).getTime()) > reversalWindowHours * 3600 * 1000);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleReversePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!reversingBill) return;

    if (!reverseReason.trim()) {
      setErrorMsg('Please specify a reason for reversing this payment.');
      return;
    }

    const reversalWindowHours = Number(settings?.security?.payment_reversal_window_hours) || 72;
    const isPastLimit = (Date.now() - new Date(reversingBill.created_at).getTime()) > reversalWindowHours * 3600 * 1000;
    if (isPastLimit && !override48h) {
      setErrorMsg(`This payment is older than ${reversalWindowHours} hours. Please check the Super Admin ${reversalWindowHours}-Hour Override box to proceed.`);
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.reverseBillPayment(
        reversingBill.id,
        reverseReason.trim(),
        reversePin,
        'Super Admin',
        override48h,
        refundAdvanceToWallet
      );
      setSuccessMsg(`Payment for ${reversingBill.bill_number} has been reversed.`);
      setReversingBill(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reverse payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcileBalances = async () => {
    setReconciling(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = await ApiService.reconcileCustomerAdvanceBalances('Super Admin');
      const dupMsg = result.duplicatesMerged ? `, merged ${result.duplicatesMerged} duplicate customer profile(s)` : '';
      setSuccessMsg(`Reconciliation complete: checked ${result.customersReconciled} customer ledgers${dupMsg}, fixed ${result.discrepanciesFixed} balance discrepancies.`);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reconcile customer balances');
    } finally {
      setReconciling(false);
    }
  };

  

  const handleViewBill = async (id: string) => {
    const fullBill = await ApiService.getBillById(id);
    if (fullBill) {
      const financial_summary = await ApiService.getBillFinancialSummary(fullBill);
      setSelectedBill({ ...fullBill, financial_summary });
    }
  };

  const handleOpenSettleDue = (bill: Bill) => {
    const remaining = Math.max(0, Number(bill.grand_total || 0) - Number(bill.paid_total || 0));
    setSettlingBill(bill);
    setSettleMethod('Cash');
    setSettleCash(Number(remaining.toFixed(2)));
    setSettleUpi('');
    setSettleNotes('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSettleDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingBill) return;
    const remaining = Math.max(0, Number(settlingBill.grand_total || 0) - Number(settlingBill.paid_total || 0));
    const cashAmt = settleMethod === 'UPI' ? 0 : Number(settleCash || 0);
    const upiAmt = settleMethod === 'Cash' ? 0 : Number(settleUpi || 0);
    const totalAmt = Number((cashAmt + upiAmt).toFixed(2));

    if (isNaN(totalAmt) || totalAmt <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than ₹0.00.');
      return;
    }
    if (totalAmt > remaining + 0.01) {
      setErrorMsg(`Amount ₹${totalAmt.toFixed(2)} exceeds remaining bill due ₹${remaining.toFixed(2)}.`);
      return;
    }

    setSettling(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const note = settleNotes.trim() || `Quick settle for ${settlingBill.bill_number}`;
      if (cashAmt > 0) {
        await ApiService.settleBillDue({
          bill_id: settlingBill.id,
          customer_id: settlingBill.customer_id,
          amount: cashAmt,
          payment_method: 'Cash',
          notes: note
        }, 'Admin');
      }
      if (upiAmt > 0) {
        await ApiService.settleBillDue({
          bill_id: settlingBill.id,
          customer_id: settlingBill.customer_id,
          amount: upiAmt,
          payment_method: 'UPI',
          notes: note
        }, 'Admin');
      }
      setSuccessMsg(`Settled ₹${totalAmt.toFixed(2)} for ${settlingBill.bill_number}.`);
      setSettlingBill(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to settle bill due');
    } finally {
      setSettling(false);
    }
  };

  const filteredBills = bills.filter(b => {
    const matchesSearch =
      !searchTerm.trim() ||
      b.bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.customer_name && b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;

    const paid = Number(b.paid_total || 0);
    const grand = Number(b.grand_total || 0);
    const remaining = Math.max(0, grand - paid);
    if (statusFilter === 'paid' && remaining > 0.01) return false;
    if (statusFilter === 'partial' && (remaining <= 0.01 || paid <= 0.01)) return false;
    if (statusFilter === 'pay_later' && (remaining <= 0.01 || paid > 0.01)) return false;

    return matchesSessionOrDateFilter(b.created_at, dateFilter, {
      closings,
      selectedClosingId,
      customFrom,
      customTo
    });
  });

  const activePeriodLabel = getPeriodDisplayLabel(dateFilter, {
    closings,
    selectedClosingId,
    customFrom,
    customTo
  });

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <FileText className="text-blue-600" size={26} />
            <span>Manage Bills & Super Admin Overrides</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Search bills, view details, edit discounts, and reverse accidental payments with audit logging</p>
        </div>

        <button
          onClick={handleReconcileBalances}
          disabled={reconciling}
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
          title="Reconcile and sync all customer advance balances from transaction history"
        >
          <RefreshCw size={14} className={reconciling ? 'animate-spin' : ''} />
          <span>{reconciling ? 'Reconciling Ledgers...' : 'Reconcile Balances'}</span>
        </button>
      </div>

      {/* Messages */}
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

      {/* Session / Time Range Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Filter size={13} /> Scope:
            </span>
            {BILLS_DATE_FILTER_BUTTONS.map(btn => (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  setDateFilter(btn.id);
                  if (btn.id !== 'closed_sessions') setSelectedClosingId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  dateFilter === btn.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 font-medium">
              {activePeriodLabel}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
              {filteredBills.length} {filteredBills.length === 1 ? 'bill' : 'bills'}
            </span>
          </div>
        </div>

        {dateFilter === 'closed_sessions' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-600">Closed Session:</span>
            {closings.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No closed sessions recorded yet.</span>
            ) : (
              <>
                <select
                  value={selectedClosingId}
                  onChange={(e) => setSelectedClosingId(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Closed Sessions ({closings.length})</option>
                  {closings.map(c => (
                    <option key={c.id} value={c.id}>
                      {formatClosingOptionLabel(c)}
                    </option>
                  ))}
                </select>
                {selectedClosingId && (() => {
                  const targetClosing = closings.find(c => c.id === selectedClosingId);
                  if (!targetClosing) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const doc = AccountingStatementGenerator.generateStatementPdf({
                          shop_settings: settings?.shop || {},
                          closing: targetClosing
                        });
                        doc.save(`Accounting-Statement-${targetClosing.closing_number || 'Session'}.pdf`);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                    >
                      <FileText size={13} />
                      <span>Download Closing PDF</span>
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Payment Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'paid', label: 'Paid' },
              { id: 'partial', label: 'Partial' },
              { id: 'pay_later', label: 'Pay Later' }
            ] as const
          ).map(st => (
            <button
              key={st.id}
              type="button"
              onClick={() => setStatusFilter(st.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
            <Calendar size={14} className="text-blue-600" />
            <span className="font-medium text-slate-600">From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                className="text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="flex items-center space-x-3 pt-2 border-t border-slate-100">
          <Search size={18} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search by Bill Number or Customer Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
          />
        </div>
      </div>

      {/* BILLS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading bills history...</div>
        ) : filteredBills.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="font-medium text-base text-slate-700">No bills found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3.5">Bill Number</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Payment Method</th>
                  <th className="px-6 py-3.5 text-right">Discount</th>
                  <th className="px-6 py-3.5 text-right">Grand Total</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-slate-800">
                {filteredBills.map((b) => {
                  const paid = Number(b.paid_total || 0);
                  const grand = Number(b.grand_total || 0);
                  const remaining = Math.max(0, grand - paid);
                  const isFullyPaid = remaining <= 0.01;
                  const isPartiallyPaid = !isFullyPaid && paid > 0.01;
                  const sessionInfo = getBillSessionInfo(b.created_at, closings);

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-data-mono font-bold text-slate-900">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{b.bill_number}</span>
                          <span
                            className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full border ${
                              sessionInfo.isClosed
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {sessionInfo.label}
                          </span>
                        </div>
                        {b.edited_at && (
                          <span className="block text-[10px] text-amber-600 font-sans font-normal flex items-center space-x-0.5 mt-0.5">
                            <Clock size={10} />
                            <span>Edited</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-data-mono text-slate-500">
                        {new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">{b.customer_name || 'Walk-in Customer'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {paid <= 0.01 || b.payment_method === 'Pay Later' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 uppercase border border-amber-200">
                              Pay Later
                            </span>
                          ) : b.payment_method === 'UPI' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 uppercase border border-indigo-200">
                              UPI
                            </span>
                          ) : b.payment_method === 'Cash' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 uppercase border border-emerald-200">
                              Cash
                            </span>
                          ) : b.payment_method === 'Split Payment' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 uppercase border border-purple-200">
                              Split
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 uppercase border border-blue-200">
                              {b.payment_method}
                            </span>
                          )}
                          {Number(b.advance_used || 0) > 0 && (
                            <span 
                              className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200"
                              title={`₹${Number(b.advance_used).toFixed(2)} deducted from customer advance`}
                            >
                              Adv: ₹{Number(b.advance_used).toFixed(2)}
                            </span>
                          )}
                          {Number(b.advance_earned || 0) > 0 && (
                            <span 
                              className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                              title={`+₹${Number(b.advance_earned).toFixed(2)} added to customer advance`}
                            >
                              +₹{Number(b.advance_earned).toFixed(2)} Adv
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-data-mono font-medium text-emerald-700">
                        {b.discount > 0 ? `₹${b.discount.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-data-mono font-bold text-slate-900 text-base">
                        ₹{Number(b.grand_total).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isFullyPaid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Fully Paid
                          </span>
                        ) : isPartiallyPaid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                            Partially Paid (₹{remaining.toFixed(2)})
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                            Pending (₹{remaining.toFixed(2)})
                          </span>
                        )}
                      </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {!isFullyPaid && b.customer_id && (
                          <button
                            onClick={() => handleOpenAllocateAdvance(b)}
                            className="p-1.5 text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded transition cursor-pointer"
                            title="Apply Customer Advance Credit to this Bill"
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        {!isFullyPaid && (
                          <button
                            onClick={() => handleOpenSettleDue(b)}
                            className="p-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                            title="Settle Due / Record Payment"
                          >
                            <CreditCard size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleViewBill(b.id)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="View Invoice"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                          title="Super Admin: Edit Bill Items & Details"
                        >
                          <Edit3 size={16} />
                        </button>
                        {paid > 0.01 && (
                          <button
                            onClick={() => handleOpenReversePayment(b)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="Super Admin: Reverse Payment / Reset to Unpaid"
                          >
                            <RotateCcw size={16} />
                          </button>
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

      {/* REVERSE PAYMENT CONFIRMATION MODAL */}
      {reversingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-rose-700 flex items-center space-x-2">
                <RotateCcw className="text-rose-600" size={20} />
                <span>Reverse Payment ({reversingBill.bill_number})</span>
              </h2>
              <button onClick={() => setReversingBill(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {reversingBill && Number(reversingBill.advance_used || 0) > 0 && (Number(reversingBill.cash_paid || 0) + Number(reversingBill.upi_paid || 0)) > 0 ? (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg space-y-1 text-xs text-amber-900">
                <span className="font-bold block">Partial Advance Protected Reversal</span>
                <p>
                  Direct Cash/UPI payment of ₹{(Number(reversingBill.cash_paid || 0) + Number(reversingBill.upi_paid || 0)).toFixed(2)} will be reversed.
                  Customer advance credit of <strong className="font-mono">₹{Number(reversingBill.advance_used).toFixed(2)}</strong> remains allocated to this bill.
                  The remaining balance of <strong className="font-mono">₹{Math.max(0, Number(reversingBill.grand_total) - Number(reversingBill.advance_used)).toFixed(2)}</strong> will be due under Pay Later.
                </p>
              </div>
            ) : (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg space-y-1 text-xs text-rose-800">
                <span className="font-bold block">Payment Reversal Warning</span>
                <p>This action will reverse recorded payment entries for this bill, revoke any awarded loyalty points, restore customer ledger dues, and reset the bill to Pay Later.</p>
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{reversingBill.customer_name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bill Grand Total:</span>
                <span className="font-mono font-bold text-slate-800">₹{Number(reversingBill.grand_total).toFixed(2)}</span>
              </div>
              {Number(reversingBill.advance_used || 0) > 0 && (
                <div className="flex justify-between text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded">
                  <span>Advance Credit Retained on Bill:</span>
                  <span className="font-mono font-bold">₹{Number(reversingBill.advance_used).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Direct Payment to Reverse:</span>
                <span className="font-mono font-extrabold text-rose-700">
                  ₹{(Number(reversingBill.cash_paid || 0) + Number(reversingBill.upi_paid || 0)).toFixed(2)}
                </span>
              </div>
              {Number(reversingBill.advance_used || 0) > 0 && (
                <div className="flex justify-between border-t border-slate-200 pt-1 text-amber-900 font-semibold">
                  <span>Remaining Due after Reversal:</span>
                  <span className="font-mono font-bold">
                    ₹{Math.max(0, Number(reversingBill.grand_total) - Number(reversingBill.advance_used)).toFixed(2)} (Pay Later)
                  </span>
                </div>
              )}
            </div>

            {/* REVERSAL LIMIT WARNING & OVERRIDE */}
            {reversingBill && isReversalPastLimit && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
                <div className="flex items-start space-x-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{Number(settings?.security?.payment_reversal_window_hours) || 72}-Hour Reversal Window Exceeded</span>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      This payment was recorded on {new Date(reversingBill.created_at).toLocaleString('en-IN')}. Super Admin override is mandatory to reverse past {Number(settings?.security?.payment_reversal_window_hours) || 72} hours.
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
                    I confirm Super Admin Override for payment older than {Number(settings?.security?.payment_reversal_window_hours) || 72} hours
                  </span>
                </label>
              </div>
            )}

            <form onSubmit={handleReversePaymentSubmit} className="space-y-3.5">
              {reversingBill && Number(reversingBill.advance_used || 0) > 0 && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center space-x-1.5 font-bold text-teal-900">
                    <Wallet size={15} className="text-teal-700" />
                    <span>Advance Credit Applied: ₹{Number(reversingBill.advance_used).toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-teal-800">
                    This bill was partially or fully settled using customer advance. Please choose how to handle this advance credit:
                  </p>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-start space-x-2 text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="advanceHandling"
                        checked={!refundAdvanceToWallet}
                        onChange={() => setRefundAdvanceToWallet(false)}
                        className="mt-0.5 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <span className="text-[11px] leading-tight">
                        <strong className="text-teal-950 font-bold block">Keep Advance on Bill (Recommended)</strong>
                        <span className="text-slate-600">Reverses only Cash/UPI payments. Advance remains allocated (₹{Number(reversingBill.advance_used).toFixed(2)} stays paid on bill).</span>
                      </span>
                    </label>
                    <label className="flex items-start space-x-2 text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="advanceHandling"
                        checked={refundAdvanceToWallet}
                        onChange={() => setRefundAdvanceToWallet(true)}
                        className="mt-0.5 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <span className="text-[11px] leading-tight">
                        <strong className="text-rose-950 font-bold block">Refund Advance to Customer Wallet</strong>
                        <span className="text-slate-600">Reverses all payments including advance. Bill becomes 100% unpaid and ₹{Number(reversingBill.advance_used).toFixed(2)} is credited back to customer wallet.</span>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Reversal *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Accidental payment marked on checkout / no cash received"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Super Admin Security PIN *</label>
                <input
                  type="password"
                  required
                  placeholder="PIN (Default: 1234)"
                  value={reversePin}
                  onChange={(e) => setReversePin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReversingBill(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw size={14} className={submitting ? 'animate-spin' : ''} />
                  <span>{submitting ? 'Reversing...' : 'Confirm Reversal to Unpaid'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FULL BILL MODAL */}
      {editingBill && (
        <EditBillModal
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSaved={(updated) => {
            setSuccessMsg(`Bill #${updated.bill_number} has been updated successfully.`);
            loadData();
          }}
        />
      )}

      {/* Allocate Customer Advance Modal */}
      {allocatingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wallet className="text-teal-400" size={20} />
                <h3 className="font-bold text-base">Apply Advance Credit</h3>
              </div>
              <button 
                onClick={() => setAllocatingBill(null)} 
                className="text-slate-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAllocateAdvanceSubmit} className="p-6 space-y-4">
              {/* Bill Details */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold uppercase">Bill Number:</span>
                  <span className="font-data-mono font-bold text-slate-900">{allocatingBill.bill_number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold uppercase">Customer:</span>
                  <span className="font-semibold text-slate-800">{allocatingBill.customer_name}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5">
                  <span className="text-slate-500 font-semibold uppercase">Grand Total:</span>
                  <span className="font-data-mono font-bold text-slate-900">₹{Number(allocatingBill.grand_total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold uppercase">Currently Paid:</span>
                  <span className="font-data-mono font-bold text-emerald-600">₹{Number(allocatingBill.paid_total || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-1.5 font-bold">
                  <span className="text-amber-700 uppercase">Remaining Due:</span>
                  <span className="font-data-mono text-base text-amber-700">
                    ₹{Math.max(0, Number(allocatingBill.grand_total) - Number(allocatingBill.paid_total || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Advance Wallet Status */}
              <div className="bg-teal-50 border border-teal-200 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">Customer Advance Balance</p>
                  <p className="text-lg font-data-mono font-extrabold text-teal-700 mt-0.5">
                    {loadingCustAdvance ? 'Checking...' : `₹${customerAdvance.toFixed(2)}`}
                  </p>
                </div>
                <div className="bg-teal-100 text-teal-800 p-2 rounded-lg">
                  {loadingCustAdvance ? <Loader2 size={20} className="animate-spin" /> : <Wallet size={20} />}
                </div>
              </div>

              {customerAdvance <= 0.009 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs flex items-center space-x-2">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>This customer currently has no unused advance balance (₹0.00).</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Amount to Allocate (₹) *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const remDue = Math.max(0, Number(allocatingBill.grand_total) - Number(allocatingBill.paid_total || 0));
                        setAllocateAmount(Number(Math.min(customerAdvance, remDue).toFixed(2)));
                      }}
                      className="text-[11px] font-bold text-teal-700 hover:underline"
                    >
                      Max (₹{Math.min(customerAdvance, Math.max(0, Number(allocatingBill.grand_total) - Number(allocatingBill.paid_total || 0))).toFixed(2)})
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.min(customerAdvance, Math.max(0, Number(allocatingBill.grand_total) - Number(allocatingBill.paid_total || 0)))}
                    required
                    value={allocateAmount}
                    onChange={(e) => setAllocateAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-data-mono font-bold text-slate-900 focus:outline-teal-500"
                    placeholder="Enter amount to apply"
                  />
                  <p className="text-[11px] text-slate-500">
                    This will increase the bill&apos;s paid total and deduct ₹{Number(allocateAmount || 0).toFixed(2)} from the customer&apos;s advance wallet.
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAllocatingBill(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocating || customerAdvance <= 0.009 || !allocateAmount}
                  className="px-5 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-lg shadow transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {allocating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Allocating...</span>
                    </>
                  ) : (
                    <>
                      <Wallet size={14} />
                      <span>Confirm &amp; Allocate ₹{Number(allocateAmount || 0).toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Settle Due Modal */}
      {settlingBill && (() => {
        const remainingDue = Math.max(0, Number(settlingBill.grand_total || 0) - Number(settlingBill.paid_total || 0));
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-emerald-50/70">
                <div className="flex items-center space-x-2">
                  <CreditCard className="text-emerald-600" size={18} />
                  <h3 className="font-bold text-slate-900 text-sm">Settle Due — {settlingBill.bill_number}</h3>
                </div>
                <button onClick={() => setSettlingBill(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSettleDueSubmit} className="p-5 space-y-4">
                <div className="flex justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-slate-600">{settlingBill.customer_name || 'Walk-in Customer'}</span>
                  <span className="font-bold text-amber-700 font-data-mono">Remaining Due: ₹{remainingDue.toFixed(2)}</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Cash', 'UPI', 'Split'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSettleMethod(m);
                          if (m === 'Cash') {
                            setSettleCash(Number(remainingDue.toFixed(2)));
                            setSettleUpi('');
                          } else if (m === 'UPI') {
                            setSettleCash('');
                            setSettleUpi(Number(remainingDue.toFixed(2)));
                          } else {
                            setSettleCash(Number((remainingDue / 2).toFixed(2)));
                            setSettleUpi(Number((remainingDue - Number((remainingDue / 2).toFixed(2))).toFixed(2)));
                          }
                        }}
                        className={`py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          settleMethod === m
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {settleMethod !== 'UPI' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cash Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={settleCash}
                      onChange={e => setSettleCash(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-data-mono font-bold text-slate-900"
                    />
                  </div>
                )}

                {settleMethod !== 'Cash' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">UPI Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={settleUpi}
                      onChange={e => setSettleUpi(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-data-mono font-bold text-slate-900"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Notes (Optional)</label>
                  <input
                    type="text"
                    value={settleNotes}
                    onChange={e => setSettleNotes(e.target.value)}
                    placeholder="e.g. Received at counter"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSettlingBill(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={settling}
                    className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {settling ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    <span>{settling ? 'Recording...' : 'Record Payment'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Invoice Modal */}
      {selectedBill && (
        <InvoiceModal 
          bill={selectedBill} 
          settings={settings || undefined} 
          customerEmail={selectedBill.customer_email || undefined} 
          onClose={() => setSelectedBill(null)} 
        />
      )}
    </div>
  );
}
