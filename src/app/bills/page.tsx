'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { Bill, AllSettings } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { InvoiceModal } from '@/components/InvoiceModal';
import { 
  FileText, 
  Search, 
  Eye, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  ShieldAlert,
  Clock,
  CreditCard,
  RotateCcw,
  RefreshCw
} from 'lucide-react';

export default function ManageBillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  // Edit Discount Modal
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [newDiscount, setNewDiscount] = useState<number | ''>('');
  const [editReason, setEditReason] = useState('');
  const [adminPin, setAdminPin] = useState('');

  // Reverse Payment Modal
  const [reversingBill, setReversingBill] = useState<Bill | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversePin, setReversePin] = useState('');

  // Feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [billsData, settingsData] = await Promise.all([
        ApiService.getBills(),
        ApiService.getSettings()
      ]);
      setBills(billsData);
      setSettings(settingsData);
    } catch (err) {
      console.error('Error fetching bills & settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleOpenEdit = (bill: Bill) => {
    setEditingBill(bill);
    setNewDiscount(bill.discount);
    setEditReason('');
    setAdminPin('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleOpenReversePayment = (bill: Bill) => {
    setReversingBill(bill);
    setReverseReason('Accidentally recorded payment when no funds received');
    setReversePin('');
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

    setSubmitting(true);
    try {
      await ApiService.reverseBillPayment(
        reversingBill.id,
        reverseReason.trim(),
        reversePin,
        'Super Admin'
      );
      // Auto-reconcile advance balances to keep customer ledgers in 100% sync
      await ApiService.reconcileCustomerAdvanceBalances('Super Admin');
      setSuccessMsg(`Payment for ${reversingBill.bill_number} has been reversed back to Unpaid.`);
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
      setSuccessMsg(`Reconciliation complete: checked ${result.customersReconciled} customer ledgers, fixed ${result.discrepanciesFixed} balance discrepancies.`);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reconcile customer balances');
    } finally {
      setReconciling(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!editingBill) return;

    const expectedPin = settings?.security?.super_admin_pin || '1234';
    if (adminPin !== expectedPin) {
      setErrorMsg('Invalid Super Admin Security PIN.');
      return;
    }

    if (!editReason.trim()) {
      setErrorMsg('Please state a reason for adjusting the bill discount.');
      return;
    }

    const disc = Number(newDiscount);
    if (isNaN(disc) || disc < 0) {
      setErrorMsg('Discount cannot be negative.');
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.editBillDiscount(editingBill.id, disc, editReason.trim(), 'Super Admin');
      setSuccessMsg('Bill discount updated & audit trail logged.');
      setEditingBill(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update discount');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewBill = async (id: string) => {
    const fullBill = await ApiService.getBillById(id);
    if (fullBill) {
      const financial_summary = await ApiService.getBillFinancialSummary(fullBill);
      setSelectedBill({ ...fullBill, financial_summary });
    }
  };

  const filteredBills = bills.filter(b => 
    b.bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.customer_name && b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search by Bill Number or Customer Name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
        />
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

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-data-mono font-bold text-slate-900">
                        {b.bill_number}
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
                      <td className="px-6 py-4 font-medium text-slate-800">{b.customer_name}</td>
                      <td className="px-6 py-4">
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
                          <Link
                            href={`/payments?customerId=${b.customer_id}`}
                            className="p-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded transition"
                            title="Collect Payment"
                          >
                            <CreditCard size={16} />
                          </Link>
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
                          title="Super Admin Edit Discount"
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

            <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg space-y-1 text-xs text-rose-800">
              <span className="font-bold block">Payment Reversal Warning</span>
              <p>This action will delete all recorded payment entries for this bill, revoke any awarded loyalty points, restore customer ledger dues, and reset the bill to <strong className="font-mono">Unpaid (₹0.00)</strong>.</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{reversingBill.customer_name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bill Grand Total:</span>
                <span className="font-mono font-bold text-slate-800">₹{Number(reversingBill.grand_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded Paid Total:</span>
                <span className="font-mono font-extrabold text-rose-700">₹{Number(reversingBill.paid_total).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleReversePaymentSubmit} className="space-y-3.5">
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

      {/* EDIT DISCOUNT MODAL */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <ShieldAlert className="text-amber-600" size={20} />
                <span>Edit Discount ({editingBill.bill_number})</span>
              </h2>
              <button onClick={() => setEditingBill(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Discount Amount (₹)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Discount Adjustment *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Owner authorized extra xerox bulk discount"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Super Admin Security PIN *</label>
                <input
                  type="password"
                  required
                  placeholder="PIN (Default: 1234)"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Update & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
