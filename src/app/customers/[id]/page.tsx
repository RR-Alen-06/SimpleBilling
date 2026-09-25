'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { Customer, CustomerLedgerEntry, PaymentMethod } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { CustomerStatementModal } from '@/components/CustomerStatementModal';
import { 
  BookOpen, 
  ArrowLeft, 
  PlusCircle, 
  Phone, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Receipt,
  FileText,
  ChevronDown,
  ChevronUp,
  Package
} from 'lucide-react';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = use(params);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [totalBilled, setTotalBilled] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [runningBalance, setRunningBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Statement Modal State
  const [showStatementModal, setShowStatementModal] = useState(false);

  // Expanded Bill Details State
  const [expandedBillIds, setExpandedBillIds] = useState<Set<string>>(new Set());

  const toggleBillExpanded = (refNo: string) => {
    setExpandedBillIds(prev => {
      const next = new Set(prev);
      if (next.has(refNo)) {
        next.delete(refNo);
      } else {
        next.add(refNo);
      }
      return next;
    });
  };

  const toggleAllBills = () => {
    const billEntries = entries.filter(e => e.type === 'BILL' && e.items && e.items.length > 0);
    if (expandedBillIds.size >= billEntries.length) {
      setExpandedBillIds(new Set());
    } else {
      setExpandedBillIds(new Set(billEntries.map(b => b.reference_no)));
    }
  };

  // Record Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLedgerData = useCallback(async () => {
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
  }, [customerId]);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const data = await ApiService.getCustomerLedger(customerId);
        if (!isCurrent) return;
        setCustomer(data.customer);
        setEntries(data.entries);
        setTotalBilled(data.totalBilled);
        setTotalPaid(data.totalPaid);
        setRunningBalance(data.runningBalance);
      } catch (err: unknown) {
        if (!isCurrent) return;
        console.error('Error loading ledger:', err);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load ledger data');
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      isCurrent = false;
    };
  }, [customerId]);

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
      const curDue = Math.max(0, runningBalance);
      const dSettled = Math.min(curDue, amt);
      const aCredited = Math.max(0, amt - curDue);

      let allocNote = '';
      if (dSettled > 0 && aCredited > 0) {
        allocNote = `[Dues Settled: ₹${dSettled.toFixed(2)} | Advance Credited: ₹${aCredited.toFixed(2)}]`;
      } else if (aCredited > 0) {
        allocNote = `[Advance Credited: ₹${aCredited.toFixed(2)}]`;
      } else if (dSettled > 0) {
        allocNote = `[Dues Settled: ₹${dSettled.toFixed(2)}]`;
      }

      const finalNotes = paymentNotes.trim()
        ? `${paymentNotes.trim()} ${allocNote}`
        : allocNote || undefined;

      await ApiService.recordCustomerPayment({
        customer_id: customerId,
        amount: amt,
        payment_method: paymentMethod,
        notes: finalNotes
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
                <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Total Billed</p>
                <p className="font-data-mono font-bold text-slate-800">₹{totalBilled.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Total Paid</p>
                <p className="font-data-mono font-bold text-emerald-600">₹{totalPaid.toFixed(2)}</p>
              </div>
              <div className="text-right bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Current Balance Due</p>
                <p className={`text-xl font-data-mono font-extrabold ${runningBalance > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  ₹{runningBalance.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setShowStatementModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                title="Generate Consolidated Purchase Statement PDF"
              >
                <FileText size={16} />
                <span>Statement PDF</span>
              </button>
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
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
            <BookOpen className="text-blue-600" size={20} />
            <span>Customer Ledger History</span>
          </h2>
          {entries.some(e => e.type === 'BILL' && e.items && e.items.length > 0) && (
            <button
              onClick={toggleAllBills}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <Package size={13} className="text-blue-600" />
              <span>{expandedBillIds.size > 0 ? 'Collapse All Items' : 'Expand All Purchases'}</span>
            </button>
          )}
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
                <tr className="bg-slate-100 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3.5">Date &amp; Time</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Reference No</th>
                  <th className="px-6 py-3.5">Description &amp; Items</th>
                  <th className="px-6 py-3.5 text-right">Bill Amount</th>
                  <th className="px-6 py-3.5 text-right">Paid Amount</th>
                  <th className="px-6 py-3.5 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-slate-800">
                {entries.map((entry) => {
                  const hasItems = entry.type === 'BILL' && entry.items && entry.items.length > 0;
                  const isExpanded = expandedBillIds.has(entry.reference_no);

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className={`transition-colors ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'}`}>
                        <td className="px-6 py-4 text-xs font-data-mono text-slate-500">
                          {new Date(entry.date).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block px-3 py-0.5 rounded-full text-[11px] font-bold ${
                            entry.type === 'BILL'
                              ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-data-mono font-bold text-slate-900">{entry.reference_no}</td>
                        <td className="px-6 py-4 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{entry.description}</span>
                            {hasItems && (
                              <button
                                onClick={() => toggleBillExpanded(entry.reference_no)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition border border-blue-200/60 shadow-2xs cursor-pointer"
                              >
                                <Package size={12} />
                                <span>{entry.items!.length} {entry.items!.length === 1 ? 'item' : 'items'}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-data-mono font-medium text-slate-800">
                          {entry.bill_amount > 0 ? `₹${entry.bill_amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-data-mono font-medium text-emerald-700">
                          {entry.paid_amount > 0 ? `₹${entry.paid_amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-data-mono font-bold text-base">
                          {entry.running_balance > 0.001 ? (
                            <span className="text-amber-700">
                              ₹{entry.running_balance.toFixed(2)}{' '}
                              <span className="text-[10px] font-semibold text-amber-600 uppercase">Due</span>
                            </span>
                          ) : entry.running_balance < -0.001 ? (
                            <span className="text-emerald-700">
                              ₹{Math.abs(entry.running_balance).toFixed(2)}{' '}
                              <span className="text-[10px] font-semibold text-emerald-600 uppercase">Adv</span>
                            </span>
                          ) : (
                            <span className="text-slate-600">₹0.00</span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Purchase Item Drawer */}
                      {isExpanded && hasItems && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={7} className="px-8 py-3.5">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2.5">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                                <span className="flex items-center gap-2">
                                  <Package size={15} className="text-blue-600" />
                                  <span>Purchased Items on {new Date(entry.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })} ({entry.reference_no})</span>
                                </span>
                                <span className="text-[11px] text-slate-400 font-normal">
                                  {entry.items!.length} distinct line item{entry.items!.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                                {entry.items!.map((it, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-slate-50/80 border border-slate-200/70 rounded-lg px-3.5 py-2.5 text-xs">
                                    <div className="pr-2">
                                      <p className="font-bold text-slate-900 leading-snug">{it.product_name}</p>
                                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                        Qty: {it.quantity} &times; ₹{it.price.toFixed(2)}
                                      </p>
                                    </div>
                                    <span className="font-data-mono font-bold text-slate-800 text-sm flex-shrink-0">
                                      ₹{it.total.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
              <h2 className="text-lg font-bold text-slate-900">Record Customer Payment</h2>
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
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* LIVE ALLOCATION PREVIEW */}
              {Number(paymentAmount || 0) > 0 && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-2.5 space-y-1 text-xs">
                  <div className="flex justify-between items-center text-indigo-950 font-bold">
                    <span>Payment Allocation:</span>
                    <span className="font-mono">₹{Number(paymentAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700 text-[11px]">
                    <span>• Applied to Dues:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      ₹{Math.min(Math.max(0, runningBalance), Number(paymentAmount)).toFixed(2)}
                    </span>
                  </div>
                  {Number(paymentAmount) > Math.max(0, runningBalance) && (
                    <div className="flex justify-between items-center text-indigo-800 text-[11px] font-bold">
                      <span>• Added to Advance:</span>
                      <span className="font-mono text-indigo-700">
                        +₹{(Number(paymentAmount) - Math.max(0, runningBalance)).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Cash', 'UPI'] as PaymentMethod[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMethod(mode)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        paymentMethod === mode
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Cleared pending dues for Xerox"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <PlusCircle size={14} />
                  <span>{submitting ? 'Recording...' : 'Save Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONSOLIDATED CUSTOMER STATEMENT MODAL */}
      {showStatementModal && (
        <CustomerStatementModal
          customerId={customerId}
          onClose={() => setShowStatementModal(false)}
        />
      )}
    </div>
  );
}
