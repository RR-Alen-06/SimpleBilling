'use client';

import React, { useState } from 'react';
import { Bill } from '@/lib/types';
import { ApiService } from '@/lib/services/api';
import { Printer, X, FileText, Receipt, CheckCircle2, MessageSquare } from 'lucide-react';

interface InvoiceModalProps {
  bill: Bill | null;
  onClose: () => void;
}

export function InvoiceModal({ bill, onClose }: InvoiceModalProps) {
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');

  if (!bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsAppText = () => {
    const text = ApiService.generateWhatsAppTextReceipt(bill);
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
  const paidTotalVal = Number(bill.paid_total || bill.grand_total || 0);
  const loyaltyEarned = Number(bill.loyalty_points_earned || 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white print:backdrop-none">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden my-8 print:shadow-none print:m-0 print:max-w-none print:w-full">
        
        {/* Modal Toolbar (Hidden during print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="text-emerald-400" size={20} />
            <span className="font-bold text-base sm:text-lg">Bill Saved Successfully</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Toggle */}
            <div className="bg-slate-800 p-1 rounded-lg flex items-center space-x-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setPrintFormat('thermal')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                  printFormat === 'thermal'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Receipt size={14} />
                <span>Thermal 80mm</span>
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
          
          {/* FORMAT 1: THERMAL RECEIPT (80mm) */}
          {printFormat === 'thermal' && (
            <div className="thermal-receipt font-mono text-slate-800 max-w-[320px] mx-auto p-4 border border-slate-200 rounded shadow-sm print:border-none print:shadow-none print:w-[80mm] print:max-w-none print:p-0">
              <div className="text-center pb-3 border-b border-dashed border-slate-400">
                <h2 className="text-base font-extrabold uppercase tracking-wide">ABC PRINTING CENTER</h2>
                <p className="text-[11px] text-slate-600">Main Road, Shop No. 12</p>
                <p className="text-[11px] text-slate-600">Ph: +91 98765 43210</p>
              </div>

              <div className="py-2 text-xs border-b border-dashed border-slate-400 space-y-0.5">
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
                  <span className="font-semibold">{bill.customer_name || 'Walk-in'}</span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-xs py-2 my-2 border-b border-dashed border-slate-400">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
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
                      <td className="py-1 text-right">₹{item.price}</td>
                      <td className="py-1 text-right font-bold">₹{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="text-xs space-y-1 py-1 border-b border-dashed border-slate-400">
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
                    <span>Rounding ({bill.rounding_method || 'Standard'}):</span>
                    <span>{roundingAdj >= 0 ? '+' : ''}₹{roundingAdj.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-slate-300">
                  <span>GRAND TOTAL:</span>
                  <span>₹{grandTotalVal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span>Payment Mode:</span>
                  <span className="font-bold uppercase">{bill.payment_method || 'Cash'}</span>
                </div>
                {loyaltyEarned > 0 && (
                  <div className="flex justify-between text-[11px] text-emerald-700 font-bold pt-1">
                    <span>Loyalty Points Earned:</span>
                    <span>+{loyaltyEarned} pts</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-3 text-[10px] text-slate-500 uppercase tracking-wider">
                *** Thank You for Visiting ***
                <br />Powered by PrintPro ERP
              </div>
            </div>
          )}

          {/* FORMAT 2: STANDARD A4 TAX INVOICE */}
          {printFormat === 'a4' && (
            <div className="a4-invoice text-slate-800 p-6 border border-slate-200 rounded-lg print:border-none print:p-0">
              {/* Header */}
              <div className="flex justify-between items-start pb-6 border-b border-slate-200">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 uppercase">INVOICE</h1>
                  <p className="text-sm font-semibold text-blue-600 mt-1">ABC PRINTING CENTER</p>
                  <p className="text-xs text-slate-500">Photocopying, Printing, Lamination & Office Supplies</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">Invoice #{bill.bill_number}</div>
                  <div className="text-xs text-slate-500 mt-1">Date: {formattedDate}</div>
                  <div className="inline-block mt-2 px-2.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 uppercase">
                    Paid via {bill.payment_method || 'Cash'}
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="my-4 p-3 bg-slate-50 rounded-lg text-xs grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block uppercase font-medium">Billed To:</span>
                  <span className="text-sm font-bold text-slate-800">{bill.customer_name || 'Walk-in Customer'}</span>
                  {bill.customer_mobile && <p className="text-slate-500 font-mono">Mobile: {bill.customer_mobile}</p>}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block uppercase font-medium">Payment Breakdown:</span>
                  <p className="font-semibold text-slate-800">Paid: ₹{paidTotalVal.toFixed(2)}</p>
                  {loyaltyEarned > 0 && (
                    <p className="text-emerald-600 font-bold mt-1">Earned Loyalty: +{loyaltyEarned} Points</p>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse my-4">
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
                      <td className="p-2.5 text-xs text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-medium text-slate-800">{item.product_name}</td>
                      <td className="p-2.5 text-center">{item.quantity}</td>
                      <td className="p-2.5 text-right">₹{item.price}</td>
                      <td className="p-2.5 text-right font-bold">₹{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-semibold">₹{subTotal.toFixed(2)}</span>
                  </div>
                  {discountVal > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount:</span>
                      <span className="font-semibold text-emerald-600">-₹{discountVal.toFixed(2)}</span>
                    </div>
                  )}
                  {roundingAdj !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Rounding ({bill.rounding_method || 'Standard'}):</span>
                      <span>{roundingAdj >= 0 ? '+' : ''}₹{roundingAdj.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300 text-slate-900">
                    <span>Grand Total:</span>
                    <span>₹{grandTotalVal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
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
