'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ApiService } from '@/lib/services/api';
import { StatementGenerator } from '@/lib/services/statementGenerator';
import { CustomerStatementData, DateFilterOption } from '@/lib/types';
import { 
  X, 
  FileText, 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Receipt,
  Layers,
  IndianRupee,
  ShoppingBag,
  Clock,
  Building2,
  Phone,
  Sparkles
} from 'lucide-react';

interface CustomerStatementModalProps {
  customerId: string;
  onClose: () => void;
}

export function CustomerStatementModal({ customerId, onClose }: CustomerStatementModalProps) {
  const [filter, setFilter] = useState<DateFilterOption>('all_time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statementData, setStatementData] = useState<CustomerStatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const fetchStatement = useCallback(async (selectedFilter: DateFilterOption, from?: string, to?: string) => {
    setLoading(true);
    try {
      const customRange = (selectedFilter === 'custom' && from && to) ? { from, to } : undefined;
      const data = await ApiService.getCustomerStatementData(customerId, selectedFilter, customRange);
      setStatementData(data);
    } catch (err) {
      console.error('Failed to load customer statement:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (filter === 'custom' && (!customFrom || !customTo)) {
        return;
      }
      try {
        const customRange = (filter === 'custom' && customFrom && customTo) ? { from: customFrom, to: customTo } : undefined;
        const data = await ApiService.getCustomerStatementData(customerId, filter, customRange);
        if (isMounted) {
          setStatementData(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load customer statement:', err);
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [customerId, filter, customFrom, customTo]);

  const handleApplyCustomFilter = () => {
    if (customFrom && customTo) {
      fetchStatement('custom', customFrom, customTo);
    }
  };

  const handleDownloadPdf = () => {
    if (!statementData) return;
    setGeneratingPdf(true);
    try {
      StatementGenerator.downloadStatementPdf(statementData);
    } catch (e) {
      console.error('PDF download error:', e);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintPdf = () => {
    if (!statementData) return;
    try {
      StatementGenerator.printCustomerStatementPdf(statementData);
    } catch (e) {
      console.error('PDF print error:', e);
    }
  };

  return (
    <div className="statement-modal-root fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 print:p-0 print:static print:bg-white print:backdrop-none">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-200 print:shadow-none print:border-none print:m-0 print:max-w-none print:w-full print:max-h-none">
        
        {/* Modal Top Header (Clean Light ERP Surface) */}
        <div className="flex items-center justify-between px-6 py-4 bg-white text-slate-900 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 font-sans">
                  Consolidated Purchase Statement
                </h2>
                <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                  ERP Multi-Bill
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>Account:</span>
                <span className="text-slate-900 font-semibold">{statementData?.customer.name || 'Loading customer account...'}</span>
                {statementData?.customer.customer_code && (
                  <span className="font-mono text-slate-500 text-[11px]">({statementData.customer.customer_code})</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPdf}
              disabled={loading || !statementData}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
              title="Print Vector Statement"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={loading || !statementData || generatingPdf}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              title="Download Statement PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{generatingPdf ? 'Generating...' : 'Export PDF'}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Filter & Control Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3 text-slate-500" /> Period:
            </span>
            {(
              [
                { id: 'all_time', label: 'All Invoices' },
                { id: 'monthly', label: 'This Month' },
                { id: 'financial_year', label: 'Financial Year (FY)' },
                { id: 'custom', label: 'Custom Range' }
              ] as const
            ).map(preset => (
              <button
                key={preset.id}
                onClick={() => setFilter(preset.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filter === preset.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {filter === 'custom' && (
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-transparent text-slate-800 focus:outline-hidden text-xs"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-transparent text-slate-800 focus:outline-hidden text-xs"
              />
              <button
                onClick={handleApplyCustomFilter}
                disabled={!customFrom || !customTo}
                className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md text-[11px] font-semibold transition"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body / Statement Live Document Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
          
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="font-medium text-slate-600">Compiling consolidated multi-bill ledger statement...</span>
            </div>
          ) : !statementData ? (
            <div className="py-16 text-center text-slate-500 font-medium">Customer record not found or access denied.</div>
          ) : (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
              
              {/* 1. STORE HEADER & STATEMENT BANNER */}
              <div className="border-b border-slate-200 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <h1 className="text-xl font-bold tracking-tight text-slate-900">
                        {statementData.shop_settings.shop_name}
                      </h1>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-md leading-relaxed">
                      {statementData.shop_settings.address}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
                      {statementData.shop_settings.phone && (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" /> {statementData.shop_settings.phone}
                        </span>
                      )}
                      {statementData.shop_settings.gst_number && (
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200 text-slate-700">
                          GSTIN: {statementData.shop_settings.gst_number}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="sm:text-right bg-blue-50/60 p-3.5 rounded-xl border border-blue-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block font-mono">
                      Consolidated Purchase Statement
                    </span>
                    <div className="text-xs font-semibold text-slate-800 mt-1">
                      Period: <span className="text-blue-600 font-bold">{statementData.period.filter_label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      Statement Date: {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. CUSTOMER PROFILE CARD */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Customer Account Summary
                  </div>
                  <div>
                    {statementData.reconciliation.current_outstanding_balance > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Balance Due: ₹{statementData.reconciliation.current_outstanding_balance.toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> All Dues Settled
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Customer Name</span>
                    <strong className="text-slate-900 text-sm font-semibold">{statementData.customer.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Contact Phone</span>
                    <span className="font-mono text-slate-700">{statementData.customer.mobile || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Email Address</span>
                    <span className="text-slate-700">{statementData.customer.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Customer ID / Code</span>
                    <span className="font-mono text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                      {statementData.customer.customer_code || 'CUST-' + statementData.customer.id.slice(0, 6).toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. BENTO KPI SUMMARY (Slate Precision Light) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total Invoiced */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <span>Total Invoiced</span>
                    <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-1.5 tabular-nums">
                    ₹{statementData.kpi.total_invoiced.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Billed amount in period</div>
                </div>

                {/* Total Paid */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <span>Total Paid</span>
                    <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-600 font-mono mt-1.5 tabular-nums">
                    ₹{statementData.kpi.total_paid.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Collected payments</div>
                </div>

                {/* Invoices Count */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <span>Invoices Count</span>
                    <Receipt className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-1.5">
                    {statementData.kpi.invoices_count} <span className="text-xs font-normal text-slate-400">bills</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Transactions logged</div>
                </div>

                {/* Total Units Bought */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <span>Units Purchased</span>
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-1.5">
                    {statementData.kpi.total_units_bought} <span className="text-xs font-normal text-slate-400">qty</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Total line items volume</div>
                </div>
              </div>

              {/* 4. DATE-GROUPED ITEMIZED PURCHASE BREAKDOWN */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-mono">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Date-by-Date Itemized Purchases
                  </h3>
                  <span className="text-xs text-slate-500 font-mono font-medium">
                    {statementData.date_groups.length} Date Group{statementData.date_groups.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {statementData.date_groups.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                    <p className="text-sm font-semibold text-slate-700">No purchase records found for this period</p>
                    <p className="text-xs text-slate-400 mt-1">No billed invoices were recorded for this customer in the selected date range.</p>
                  </div>
                ) : (
                  statementData.date_groups.map(group => (
                    <div key={group.raw_date} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                      
                      {/* Date Group Header */}
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs font-bold text-slate-900 font-sans">
                            {group.date_formatted}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {group.bills.length} Invoice{group.bills.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Bills within this date */}
                      <div className="divide-y divide-slate-100">
                        {group.bills.map(bill => {
                          const billTime = new Date(bill.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                          const isFullyPaid = bill.balance_due <= 0.01;

                          return (
                            <div key={bill.bill_id} className="p-4 space-y-3">
                              {/* Bill Banner */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    {bill.bill_number}
                                  </span>
                                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3 text-slate-400" /> {billTime}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {isFullyPaid ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Fully Settled
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                                      <AlertCircle className="w-3 h-3 text-amber-600" /> Due: ₹{bill.balance_due.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* ERP High Density Items Table */}
                              <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                      <th className="py-2 px-3 w-10 text-center font-mono">#</th>
                                      <th className="py-2 px-3 font-sans">Product Description</th>
                                      <th className="py-2 px-3 text-right font-mono">Qty</th>
                                      <th className="py-2 px-3 text-right font-mono">Unit Rate</th>
                                      <th className="py-2 px-3 text-right font-mono">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {bill.items.map(item => (
                                      <tr key={item.item_index} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{item.item_index}</td>
                                        <td className="py-2 px-3 font-medium text-slate-900">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span>{item.product_name}</span>
                                            {item.is_custom_item && (
                                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-tight">
                                                Custom
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                                          {item.quantity}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                                          ₹{item.price.toFixed(2)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                          ₹{item.total.toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Bill Subtotals Line */}
                              <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-xs text-slate-600 pt-1">
                                {bill.discount > 0 && (
                                  <span>Discount: <strong className="text-amber-600 font-mono">₹{bill.discount.toFixed(2)}</strong></span>
                                )}
                                <span>Total: <strong className="text-slate-900 font-mono">₹{bill.grand_total.toFixed(2)}</strong></span>
                                <span>Paid: <strong className="text-emerald-600 font-mono">₹{bill.paid_amount.toFixed(2)}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 5. STATEMENT RECONCILIATION & BALANCE CARD (Slate Precision Dark Accents) */}
              <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4 border border-slate-800 shadow-md">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center justify-between font-mono">
                  <span>Statement Reconciliation Summary</span>
                  {statementData.reconciliation.advance_balance > 0 && (
                    <span className="text-emerald-400 font-medium normal-case flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Customer Advance Credit: ₹{statementData.reconciliation.advance_balance.toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Period Purchases</span>
                    <span className="text-lg font-bold font-mono text-white">
                      ₹{statementData.reconciliation.period_purchases.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Period Payments Collected</span>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                      ₹{statementData.reconciliation.period_payments.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Current Outstanding Ledger Balance</span>
                    <span className={`text-xl font-bold font-mono ${statementData.reconciliation.current_outstanding_balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      ₹{statementData.reconciliation.current_outstanding_balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer text */}
              <p className="text-center text-[11px] text-slate-500 italic">
                {statementData.shop_settings.footer_message || 'Thank you for your business. For any queries regarding this statement, please contact the store.'}
              </p>

            </div>
          )}

        </div>

        {/* Modal Bottom Toolbar */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="font-mono text-[11px] text-slate-600">
            {statementData ? (
              <span>Verified Ledger • High-Density ERP Export Ready</span>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPdf}
              disabled={loading || !statementData}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 transition disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={loading || !statementData || generatingPdf}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{generatingPdf ? 'Generating PDF...' : 'Download Statement PDF'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

