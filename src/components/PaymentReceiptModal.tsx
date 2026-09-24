'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Payment, CustomerSummary, AllSettings } from '@/lib/types';
import { ApiService, DEFAULT_SETTINGS } from '@/lib/services/api';
import { 
  Printer, 
  X, 
  CheckCircle2, 
  MessageSquare, 
  Receipt,
  Wallet,
  Building2,
  Calendar,
  User,
  Phone,
  ArrowRight
} from 'lucide-react';

interface PaymentReceiptModalProps {
  payment: Payment | null;
  customer?: CustomerSummary | null;
  settings?: AllSettings;
  onClose: () => void;
}

export function PaymentReceiptModal({
  payment,
  customer,
  settings: propSettings,
  onClose
}: PaymentReceiptModalProps) {
  const [settings, setSettings] = useState<AllSettings>(propSettings || DEFAULT_SETTINGS);
  const [customerDetails, setCustomerDetails] = useState<CustomerSummary | null>(customer || null);
  const voucherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!propSettings) {
      ApiService.getSettings().then(s => {
        if (s) setSettings(s);
      }).catch(console.error);
    }
  }, [propSettings]);

  useEffect(() => {
    if (payment?.customer_id && !customer) {
      ApiService.getCustomerSummaries().then(list => {
        const found = list.find(c => c.id === payment.customer_id);
        if (found) setCustomerDetails(found);
      }).catch(console.error);
    }
  }, [payment, customer]);

  if (!payment) return null;

  const notesText = payment.notes || '';
  
  // Extract allocation breakdown if present in notes
  const duesMatch = notesText.match(/Dues Settled:\s*₹?([\d.]+)/i);
  const advMatch = notesText.match(/Advance Credited:\s*₹?([\d.]+)/i);
  const standaloneAdvMatch = notesText.match(/Advance Payment:\s*₹?([\d.]+)/i);

  const duesSettledVal = duesMatch ? Number(duesMatch[1]) : 0;
  const advanceCreditedVal = advMatch ? Number(advMatch[1]) : (standaloneAdvMatch ? Number(standaloneAdvMatch[1]) : 0);
  const hasStructuredBreakdown = duesSettledVal > 0 || advanceCreditedVal > 0;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const custName = payment.customer_name || customerDetails?.name || 'Customer';
    const amountStr = Number(payment.amount).toFixed(2);
    const shopName = settings.shop.shop_name || 'Store';
    
    let msg = `*Payment Receipt - ${shopName}*\n`;
    msg += `Receipt No: ${payment.payment_number || 'PAY'}\n`;
    msg += `Date: ${new Date(payment.created_at).toLocaleDateString('en-IN')}\n`;
    msg += `Customer: ${custName}\n`;
    msg += `Payment Mode: ${payment.payment_method}\n`;
    msg += `*Amount Received: ₹${amountStr}*\n`;
    
    if (hasStructuredBreakdown) {
      if (duesSettledVal > 0) msg += `• Dues Cleared: ₹${duesSettledVal.toFixed(2)}\n`;
      if (advanceCreditedVal > 0) msg += `• Advance Credited: ₹${advanceCreditedVal.toFixed(2)}\n`;
    }

    if (customerDetails) {
      msg += `\n*Current Account Balance:*\n`;
      msg += `• Pending Dues: ₹${customerDetails.balance_due.toFixed(2)}\n`;
      msg += `• Advance Balance: ₹${customerDetails.advance_balance.toFixed(2)}\n`;
    }
    
    msg += `\nThank you for your payment!`;

    const phone = payment.customer_mobile || customerDetails?.mobile;
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
    const waUrl = cleanPhone 
      ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Receipt size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Payment Receipt Voucher</h3>
              <p className="text-xs text-slate-400 font-mono">{payment.payment_number || 'RECEIPT'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 space-y-5 print:p-0" ref={voucherRef}>
          
          {/* Shop Header */}
          <div className="text-center border-b border-slate-100 pb-4 space-y-1">
            <h2 className="font-extrabold text-lg text-slate-900 uppercase tracking-wide">
              {settings.shop.shop_name || 'SIMPLEBILLING STORE'}
            </h2>
            {settings.shop.address && (
              <p className="text-xs text-slate-500">{settings.shop.address}</p>
            )}
            <div className="text-[11px] text-slate-500 flex items-center justify-center space-x-3 font-medium">
              {settings.shop.phone && <span>Ph: {settings.shop.phone}</span>}
              {settings.shop.gst_number && <span>GSTIN: {settings.shop.gst_number}</span>}
            </div>
            <div className="pt-2">
              <span className="inline-block bg-slate-100 text-slate-800 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border border-slate-200">
                Official Payment Voucher
              </span>
            </div>
          </div>

          {/* Transaction Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Receipt No:</span>
              <span className="font-mono font-bold text-slate-900 text-xs">{payment.payment_number || 'N/A'}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Date & Time:</span>
              <span className="font-semibold text-slate-700 text-xs">
                {new Date(payment.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Customer:</span>
              <span className="font-bold text-slate-900 text-xs">{payment.customer_name || customerDetails?.name || 'Customer'}</span>
              {(payment.customer_mobile || customerDetails?.mobile) && (
                <span className="text-[11px] text-slate-500 block font-mono">
                  {payment.customer_mobile || customerDetails?.mobile}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Payment Mode:</span>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                payment.payment_method === 'Cash'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-indigo-100 text-indigo-800'
              }`}>
                {payment.payment_method}
              </span>
            </div>
          </div>

          {/* Amount Paid Highlight */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold uppercase text-emerald-900">Total Amount Received</span>
              <p className="text-[11px] text-emerald-700">Verified & Succeeded</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-700 font-mono">
                ₹{Number(payment.amount).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Allocation Breakdown (Dues vs Advance) */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
              Payment Allocation Breakdown
            </h4>

            {hasStructuredBreakdown ? (
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
                {duesSettledVal > 0 && (
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                    <span className="text-slate-700 font-medium flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      <span>Applied to Clear Bill Dues:</span>
                    </span>
                    <span className="font-bold text-slate-900 font-mono">
                      ₹{duesSettledVal.toFixed(2)}
                    </span>
                  </div>
                )}

                {advanceCreditedVal > 0 && (
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-700 font-medium flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                      <span>Added to Customer Advance:</span>
                    </span>
                    <span className="font-bold text-indigo-700 font-mono">
                      +₹{advanceCreditedVal.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                <span className="font-semibold block text-slate-800 mb-0.5">Payment Reference:</span>
                <span>{payment.notes || 'Direct payment recorded towards customer ledger.'}</span>
              </div>
            )}
          </div>

          {/* Updated Customer Balances */}
          {customerDetails && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="border-r border-slate-200 pr-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining Due</span>
                <span className={`font-extrabold text-sm ${customerDetails.balance_due > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                  ₹{customerDetails.balance_due.toFixed(2)}
                </span>
              </div>
              <div className="pl-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Advance Balance</span>
                <span className="font-extrabold text-sm text-blue-700">
                  ₹{customerDetails.advance_balance.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="text-center pt-1">
            <p className="text-[10px] text-slate-400">
              Generated digitally by {settings.shop.shop_name || 'SimpleBilling'}. Valid payment voucher.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
          >
            <MessageSquare size={15} />
            <span>WhatsApp</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer size={15} />
              <span>Print Voucher</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
