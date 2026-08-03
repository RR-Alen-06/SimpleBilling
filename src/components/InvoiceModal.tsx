'use client';

import React, { useState, useEffect } from 'react';
import { Bill, BillFinancialSummary } from '@/lib/types';
import { ApiService } from '@/lib/services/api';
import { Printer, X, FileText, Receipt, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';

interface InvoiceModalProps {
  bill: Bill | null;
  onClose: () => void;
}

export function InvoiceModal({ bill, onClose }: InvoiceModalProps) {
  const [printFormat, setPrintFormat] = useState<'thermal-80' | 'thermal-58' | 'a4'>('thermal-80');
  const [financialSummary, setFinancialSummary] = useState<BillFinancialSummary | null>(bill?.financial_summary || null);
  const [loadingSummary, setLoadingSummary] = useState(!bill?.financial_summary);

  useEffect(() => {
    let active = true;
    if (bill) {
      if (bill.financial_summary) {
        setFinancialSummary(bill.financial_summary);
        setLoadingSummary(false);
      } else {
        setLoadingSummary(true);
        ApiService.getBillFinancialSummary(bill).then(summary => {
          if (active) {
            setFinancialSummary(summary);
            setLoadingSummary(false);
          }
        });
      }
    }
    return () => { active = false; };
  }, [bill]);

  if (!bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsAppText = () => {
    const text = ApiService.generateWhatsAppTextReceipt(bill, financialSummary || undefined);
    const encoded = encodeURIComponent(text);
    const phone = bill.customer_mobile ? bill.customer_mobile.replace(/[^0-9]/g, '') : '';
    const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const formattedDate = bill.created_at 
    ? new Date(bill.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const subTotal = Number(bill.total || 0);
  const discountVal = Number(bill.discount || 0);
  const roundingAdj = Number(bill.rounding_adjustment || 0);
  const grandTotalVal = Number(bill.grand_total || 0);

  const summary = financialSummary || {
    previous_outstanding: 0,
    previous_advance: 0,
    current_bill_amount: grandTotalVal,
    total_amount_due: grandTotalVal,
    cash_paid: Number(bill.cash_paid || 0),
    upi_paid: Number(bill.upi_paid || 0),
    advance_used: Number(bill.advance_used || 0),
    total_paid: Number(bill.paid_total || 0),
    remaining_balance: Math.max(0, grandTotalVal - Number(bill.paid_total || 0)),
    remaining_advance_balance: Number(bill.advance_earned || 0),
    payment_status: (Math.max(0, grandTotalVal - Number(bill.paid_total || 0)) === 0 ? 'Fully Paid' : 'Payment Pending') as 'Fully Paid' | 'Payment Pending'
  };

  const isPending = summary.remaining_balance > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white print:backdrop-none">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden my-8 print:shadow-none print:m-0 print:max-w-none print:w-full">
        
        {/* Modal Toolbar (Hidden during print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="text-emerald-400" size={20} />
            <span className="font-bold text-base sm:text-lg">Bill Saved & Receipt Ready</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Toggle */}
            <div className="bg-slate-800 p-1 rounded-lg flex items-center space-x-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setPrintFormat('thermal-80')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                  printFormat === 'thermal-80'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Receipt size={14} />
                <span>Thermal 80mm</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintFormat('thermal-58')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                  printFormat === 'thermal-58'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Receipt size={14} />
                <span>Thermal 58mm</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                  printFormat === 'a4'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText size={14} />
                <span>A4 Invoice</span>
              </button>
            </div>

            {/* WhatsApp Share Action */}
            <button
              onClick={handleShareWhatsAppText}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow transition"
              title="Share Text Receipt on WhatsApp"
            >
              <MessageSquare size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow transition"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PRINT CONTAINER */}
        <div className="p-6 overflow-y-auto max-h-[80vh] print:max-h-none print:overflow-visible print:p-0">
          {loadingSummary && (
            <div className="p-4 mb-4 text-xs bg-blue-50 text-blue-700 rounded flex items-center space-x-2 print:hidden">
              <span className="animate-spin">⌛</span>
              <span>Loading complete customer financial summary from database...</span>
            </div>
          )}
          
          {/* FORMAT 1: THERMAL RECEIPT (80mm & 58mm) */}
          {(printFormat === 'thermal-80' || printFormat === 'thermal-58') && (
            <div className={`thermal-receipt font-mono text-slate-900 mx-auto p-4 border border-slate-200 rounded shadow-sm print:border-none print:shadow-none print:p-0 ${
              printFormat === 'thermal-58' ? 'max-w-[240px] print:w-[58mm] text-[11px]' : 'max-w-[320px] print:w-[80mm] text-xs'
            }`}>
              {/* Shop Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-400">
                <h2 className="text-sm font-extrabold uppercase tracking-wide">ABC PRINTING CENTER</h2>
                <p className="text-[10px] text-slate-600">Main Road, Shop No. 12</p>
                <p className="text-[10px] text-slate-600">Ph: +91 98765 43210</p>
              </div>

              {/* Bill & Customer Meta */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Bill No:</span>
                  <span className="font-bold">{bill.bill_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-semibold">{bill.customer_name || 'N/A'}</span>
                </div>
                {bill.customer_mobile && (
                  <div className="flex justify-between">
                    <span>Mobile:</span>
                    <span>{bill.customer_mobile}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1">
                  <span>Status:</span>
                  <span className={summary.payment_status === 'Fully Paid' ? 'text-emerald-700' : summary.payment_status === 'Partially Paid' ? 'text-blue-700' : 'text-amber-700'}>
                    Status : {summary.payment_status}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full py-2 my-1 border-b border-dashed border-slate-400 text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-left uppercase text-[10px] font-bold">
                    <th className="py-1">Item</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bill.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1 font-sans">{item.product_name}</td>
                      <td className="py-1 text-center">{item.quantity}</td>
                      <td className="py-1 text-right">₹{item.price.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold">₹{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Current Bill Totals */}
              <div className="space-y-1 py-1 border-b border-dashed border-slate-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subTotal.toFixed(2)}</span>
                </div>
                {discountVal > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span>-₹{discountVal.toFixed(2)}</span>
                  </div>
                )}
                {roundingAdj !== 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Rounding:</span>
                    <span>{roundingAdj >= 0 ? '+' : ''}₹{roundingAdj.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-extrabold pt-1 border-t border-slate-300">
                  <span>Current Bill:</span>
                  <span>₹{grandTotalVal.toFixed(2)}</span>
                </div>
              </div>

              {/* 1. Customer Ledger Summary */}
              <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-0.5">
                <div className="text-center font-bold uppercase text-[10px] text-slate-700 tracking-wider pb-0.5">--- LEDGER SUMMARY ---</div>
                <div className="flex justify-between">
                  <span>Previous Outstanding:</span>
                  <span>₹{summary.previous_outstanding.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Previous Advance:</span>
                  <span>₹{summary.previous_advance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Bill:</span>
                  <span>₹{summary.current_bill_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                  <span>Total Amount Due:</span>
                  <span>₹{summary.total_amount_due.toFixed(2)}</span>
                </div>
              </div>

              {/* 2. Payment Summary */}
              <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-0.5">
                <div className="text-center font-bold uppercase text-[10px] text-slate-700 tracking-wider pb-0.5">--- PAYMENT SUMMARY ---</div>
                <div className="flex justify-between">
                  <span>Cash Paid:</span>
                  <span>₹{summary.cash_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>UPI Paid:</span>
                  <span>₹{summary.upi_paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Advance Used:</span>
                  <span>₹{summary.advance_used.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                  <span>Total Paid:</span>
                  <span>₹{summary.total_paid.toFixed(2)}</span>
                </div>
              </div>

              {/* 3. Balance Summary */}
              <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-1">
                <div className="text-center font-bold uppercase text-[10px] text-slate-700 tracking-wider pb-0.5">--- BALANCE SUMMARY ---</div>
                <div className="flex justify-between font-semibold">
                  <span>Current Bill Balance Due:</span>
                  <span>₹{Math.max(0, summary.current_bill_amount - summary.total_paid).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold p-1 rounded ${isPending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
                  <span>Net Account Balance Due:</span>
                  <span>₹{summary.remaining_balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer Advance Bal:</span>
                  <span>₹{summary.remaining_advance_balance.toFixed(2)}</span>
                </div>
              </div>

              {/* 4. Loyalty Summary (If Enabled) */}
              {summary.loyalty && summary.loyalty.enabled && (
                <div className="py-2 border-b border-dashed border-slate-400 text-[11px] space-y-0.5">
                  <div className="text-center font-bold uppercase text-[10px] text-slate-700 tracking-wider pb-0.5">--- LOYALTY SUMMARY ---</div>
                  {summary.remaining_balance === 0 || summary.loyalty.is_fully_paid ? (
                    <>
                      <div className="flex justify-between font-bold text-emerald-700">
                        <span>Loyalty Earned:</span>
                        <span>+{summary.loyalty.points_earned} Points</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>Previous Points:</span>
                        <span>{summary.loyalty.previous_points} pts</span>
                      </div>
                      {summary.loyalty.points_redeemed > 0 && (
                        <div className="flex justify-between text-[10px] text-rose-600">
                          <span>Points Redeemed:</span>
                          <span>-{summary.loyalty.points_redeemed} pts</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold pt-0.5 border-t border-slate-200">
                        <span>Loyalty Balance:</span>
                        <span>{summary.loyalty.current_points_balance} pts</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-amber-800 text-[10px] font-semibold py-1">
                      ⏳ Loyalty Points will be credited after this bill is fully paid.
                    </div>
                  )}
                </div>
              )}

              <div className="text-center pt-3 text-[10px] text-slate-500 uppercase tracking-wider">
                *** Thank You for Visiting ***
                <br />Powered by PrintPro ERP
              </div>
            </div>
          )}

          {/* FORMAT 2: STANDARD A4 TAX INVOICE */}
          {printFormat === 'a4' && (
            <div className="a4-invoice text-slate-800 p-6 border border-slate-200 rounded-lg print:border-none print:p-0 space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start pb-6 border-b border-slate-200">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 uppercase tracking-wide">TAX INVOICE</h1>
                  <p className="text-sm font-bold text-blue-600 mt-1">ABC PRINTING CENTER</p>
                  <p className="text-xs text-slate-500">Photocopying, Printing, Lamination & Office Supplies</p>
                  <p className="text-xs text-slate-500">Main Road, Shop No. 12 • Ph: +91 98765 43210</p>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-sm font-bold text-slate-900">Invoice #{bill.bill_number}</div>
                  <div className="text-xs text-slate-500">Date: {formattedDate}</div>
                  <div className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase ${
                    isPending ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {summary.payment_status === 'Fully Paid' ? 'Status : Fully Paid' : 'Status : Payment Pending'}
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="p-4 bg-slate-50 rounded-xl text-xs grid grid-cols-2 gap-4 border border-slate-200">
                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wider">Billed To:</span>
                  <span className="text-base font-extrabold text-slate-900">{bill.customer_name || 'N/A'}</span>
                  {bill.customer_mobile ? (
                    <p className="text-slate-600 font-mono mt-0.5">Mobile: {bill.customer_mobile}</p>
                  ) : (
                    <p className="text-slate-400 italic mt-0.5">No registered phone number</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wider">Payment Mode:</span>
                  <p className="text-sm font-bold text-slate-800 uppercase mt-0.5">{bill.payment_method || 'Cash'}</p>
                  <p className="text-slate-600 font-medium">Total Paid Now: ₹{summary.total_paid.toFixed(2)}</p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs uppercase font-semibold">
                    <th className="p-2.5 rounded-l">#</th>
                    <th className="p-2.5">Item & Description</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-right rounded-r">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {bill.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-xs text-slate-400 font-data-mono">{idx + 1}</td>
                      <td className="p-2.5 font-medium text-slate-800">{item.product_name}</td>
                      <td className="p-2.5 text-center font-data-mono">{item.quantity}</td>
                      <td className="p-2.5 text-right font-data-mono">₹{item.price.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-data-mono font-bold text-slate-900">₹{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Current Bill Subtotal & Grand Total */}
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <div className="w-64 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-medium">₹{subTotal.toFixed(2)}</span>
                  </div>
                  {discountVal > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount:</span>
                      <span className="font-medium text-emerald-600">-₹{discountVal.toFixed(2)}</span>
                    </div>
                  )}
                  {roundingAdj !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Rounding ({bill.rounding_method || 'Standard'}):</span>
                      <span>{roundingAdj >= 0 ? '+' : ''}₹{roundingAdj.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-slate-300 text-slate-900">
                    <span>Current Bill Total:</span>
                    <span>₹{grandTotalVal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* DEDICATED CUSTOMER ACCOUNT SUMMARY SECTION */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wider">
                    Customer Account Summary
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                    isPending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {summary.payment_status === 'Fully Paid' ? 'Status : Fully Paid' : 'Status : Payment Pending'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  {/* Ledger Summary */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1.5 shadow-sm">
                    <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider border-b pb-1 text-blue-600">1. Ledger Summary</p>
                    <div className="flex justify-between text-slate-600">
                      <span>Previous Outstanding:</span>
                      <span className="font-semibold text-slate-800">₹{summary.previous_outstanding.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Previous Advance:</span>
                      <span className="font-semibold text-slate-800">₹{summary.previous_advance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Current Bill Amount:</span>
                      <span className="font-semibold text-slate-800">₹{summary.current_bill_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-slate-900 pt-1.5 border-t border-slate-100">
                      <span>Total Amount Due:</span>
                      <span className="text-blue-700">₹{summary.total_amount_due.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1.5 shadow-sm">
                    <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider border-b pb-1 text-emerald-600">2. Payment Summary</p>
                    <div className="flex justify-between text-slate-600">
                      <span>Cash Paid:</span>
                      <span className="font-medium">₹{summary.cash_paid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>UPI Paid:</span>
                      <span className="font-medium">₹{summary.upi_paid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Advance Used:</span>
                      <span className="font-medium">₹{summary.advance_used.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-slate-900 pt-1.5 border-t border-slate-100">
                      <span>Total Paid:</span>
                      <span className="text-emerald-700">₹{summary.total_paid.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Balance Summary */}
                  <div className={`p-3.5 rounded-lg border space-y-1.5 shadow-sm ${
                    isPending ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/70 border-emerald-200'
                  }`}>
                    <p className={`font-bold uppercase text-[10px] tracking-wider border-b pb-1 ${
                      isPending ? 'text-amber-800 border-amber-200' : 'text-emerald-800 border-emerald-200'
                    }`}>
                      3. Balance Summary
                    </p>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Remaining Balance:</span>
                      <span className={`font-extrabold text-sm ${isPending ? 'text-amber-700' : 'text-emerald-700'}`}>
                        ₹{summary.remaining_balance.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-right font-medium">
                      Status : {summary.payment_status}
                    </p>
                    <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200/60">
                      <span>Customer Advance Bal:</span>
                      <span className="font-semibold text-slate-800">₹{summary.remaining_advance_balance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Loyalty Summary (If Enabled) */}
                {summary.loyalty && summary.loyalty.enabled && (
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs shadow-sm">
                    <div className="flex items-center space-x-2">
                      <span className="text-base">{summary.remaining_balance === 0 || summary.loyalty.is_fully_paid ? '🎁' : '⏳'}</span>
                      <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">Loyalty Summary</span>
                    </div>

                    {summary.remaining_balance === 0 || summary.loyalty.is_fully_paid ? (
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200">
                          <span className="text-emerald-800 block text-[10px] font-bold">Loyalty Earned</span>
                          <span className="font-extrabold text-emerald-700 text-sm">+{summary.loyalty.points_earned} Points</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Previous Points</span>
                          <span className="font-bold text-slate-800">{summary.loyalty.previous_points} pts</span>
                        </div>
                        {summary.loyalty.points_redeemed > 0 && (
                          <div>
                            <span className="text-slate-500 block text-[10px]">Points Redeemed</span>
                            <span className="font-bold text-rose-600">-{summary.loyalty.points_redeemed} pts</span>
                          </div>
                        )}
                        <div className="bg-slate-100 px-3 py-1 rounded-md border border-slate-200">
                          <span className="text-slate-500 block text-[10px] font-bold uppercase">Current Loyalty Balance</span>
                          <span className="font-extrabold text-blue-700 text-sm">{summary.loyalty.current_points_balance} pts</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-lg border border-amber-200 font-semibold text-xs flex items-center space-x-1">
                        <span>⏳ Loyalty Points will be credited after this bill is fully paid.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
                Thank you for visiting. Powered by PrintPro ERP
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center print:hidden">
          <button
            onClick={handleShareWhatsAppText}
            className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-lg border border-emerald-200 flex items-center space-x-1.5 transition"
          >
            <MessageSquare size={14} />
            <span>Share WhatsApp Text Receipt</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium text-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
