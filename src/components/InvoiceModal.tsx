'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bill, BillFinancialSummary, AllSettings } from '@/lib/types';
import { ApiService, DEFAULT_SETTINGS } from '@/lib/services/api';
import { 
  Printer, 
  X, 
  FileText, 
  Receipt, 
  CheckCircle2, 
  MessageSquare, 
  Download, 
  Mail, 
  Share2, 
  Send, 
  ChevronDown, 
  Loader2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import emailjs from '@emailjs/browser';

interface InvoiceModalProps {
  bill: Bill | null;
  settings?: AllSettings;
  customerEmail?: string;
  onClose: () => void;
}

export function InvoiceModal({ bill, settings: propSettings, customerEmail: propEmail, onClose }: InvoiceModalProps) {
  const [printFormat, setPrintFormat] = useState<'thermal-80' | 'thermal-58' | 'a4'>('thermal-80');
  const [financialSummary, setFinancialSummary] = useState<BillFinancialSummary | null>(bill?.financial_summary || null);
  const [loadingSummary, setLoadingSummary] = useState(!bill?.financial_summary);
  const [loadedSettings, setLoadedSettings] = useState<AllSettings>(propSettings || DEFAULT_SETTINGS);
  
  // PDF download & Email states
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const invoiceRef = useRef<HTMLDivElement>(null);
  const shareDropdownRef = useRef<HTMLDivElement>(null);

  // Load settings if not passed as prop
  useEffect(() => {
    if (propSettings) {
      setLoadedSettings(propSettings);
    } else {
      ApiService.getSettings().then(s => {
        if (s) setLoadedSettings(s);
      }).catch(err => console.error('Failed to load settings in InvoiceModal:', err));
    }
  }, [propSettings]);

  // Load financial summary
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

  // Close share dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareDropdownRef.current && !shareDropdownRef.current.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear toast after 4s
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  if (!bill) return null;

  const shop = loadedSettings.shop;
  const billingConfig = loadedSettings.billing;
  const waConfig = loadedSettings.whatsapp;
  const customerEmail = propEmail || bill.customer_email || undefined;

  const handlePrint = () => {
    document.documentElement.dataset.printFormat = printFormat;
    window.print();
  };

  const generatePdfInstance = async (): Promise<{ pdf: jsPDF; filename: string } | null> => {
    if (!invoiceRef.current) return null;
    const element = invoiceRef.current;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    let pdf: jsPDF;

    if (printFormat === 'a4') {
      pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
    } else if (printFormat === 'thermal-80') {
      const heightMm = (canvas.height * 80) / canvas.width;
      pdf = new jsPDF('p', 'mm', [80, heightMm]);
      pdf.addImage(imgData, 'PNG', 0, 0, 80, heightMm);
    } else { // thermal-58
      const heightMm = (canvas.height * 58) / canvas.width;
      pdf = new jsPDF('p', 'mm', [58, heightMm]);
      pdf.addImage(imgData, 'PNG', 0, 0, 58, heightMm);
    }

    const filename = `Bill-${bill.bill_number}.pdf`;
    return { pdf, filename };
  };

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true);
    try {
      const result = await generatePdfInstance();
      if (result) {
        result.pdf.save(result.filename);
        setToastMsg({ text: `Downloaded ${result.filename}`, type: 'success' });
      }
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setToastMsg({ text: 'Failed to generate PDF file.', type: 'error' });
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleShareWhatsAppText = () => {
    const text = ApiService.generateWhatsAppTextReceipt(bill, financialSummary || undefined);
    const encoded = encodeURIComponent(text);
    const phone = bill.customer_mobile ? bill.customer_mobile.replace(/[^0-9]/g, '') : '';
    const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
    setShareMenuOpen(false);
  };

  const handleShareTelegram = () => {
    const text = ApiService.generateWhatsAppTextReceipt(bill, financialSummary || undefined);
    const url = `https://t.me/share/url?url=${encodeURIComponent('')}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setShareMenuOpen(false);
  };

  const handleShareSMS = () => {
    const text = ApiService.generateWhatsAppTextReceipt(bill, financialSummary || undefined);
    const phone = bill.customer_mobile ? bill.customer_mobile.replace(/[^0-9]/g, '') : '';
    const url = `sms:${phone}?body=${encodeURIComponent(text)}`;
    window.open(url);
    setShareMenuOpen(false);
  };

  const handleNativeShare = async () => {
    setShareMenuOpen(false);
    const text = ApiService.generateWhatsAppTextReceipt(bill, financialSummary || undefined);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Bill ${bill.bill_number} - ${shop.shop_name}`,
          text: text
        });
        setToastMsg({ text: 'Shared successfully!', type: 'success' });
      } catch {
        // User cancelled or share failed
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setToastMsg({ text: 'Receipt text copied to clipboard!', type: 'info' });
    }
  };

  const handleShareEmail = async () => {
    setShareMenuOpen(false);
    if (!customerEmail) {
      setToastMsg({ text: 'No customer email on file — add one in Customers directory', type: 'error' });
      return;
    }

    const serviceId = waConfig.email_service_id;
    const templateId = waConfig.email_template_id;
    const publicKey = waConfig.email_public_key;

    if (!serviceId || !templateId || !publicKey) {
      setToastMsg({ 
        text: 'EmailJS not configured in Settings → Share & Notifications.', 
        type: 'error' 
      });
      return;
    }

    setSendingEmail(true);
    try {
      const result = await generatePdfInstance();
      if (!result) throw new Error('Could not generate PDF attachment');

      const pdfBase64 = result.pdf.output('datauristring');

      await emailjs.send(
        serviceId,
        templateId,
        {
          to_email: customerEmail,
          bill_number: bill.bill_number,
          customer_name: bill.customer_name || 'Valued Customer',
          grand_total: bill.grand_total,
          shop_name: shop.shop_name,
          pdf_attachment: pdfBase64
        },
        publicKey
      );

      setToastMsg({ text: `Email with PDF sent to ${customerEmail}!`, type: 'success' });
    } catch (err: unknown) {
      console.error('EmailJS send error:', err);
      setToastMsg({ 
        text: err instanceof Error ? err.message : 'Failed to send email. Check EmailJS keys in Settings.', 
        type: 'error' 
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const formattedDate = bill.created_at 
    ? new Date(bill.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const subTotal = Number(bill.total || 0);
  const discountVal = Number(bill.discount || 0);
  const gstAmount = Number(bill.gst_amount || 0);
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

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={downloadingPDF}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow transition"
              title="Download Real PDF File"
            >
              {downloadingPDF ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Download PDF</span>
                </>
              )}
            </button>

            {/* Share Dropdown Button */}
            <div className="relative" ref={shareDropdownRef}>
              <button
                onClick={() => setShareMenuOpen(!shareMenuOpen)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow transition"
                title="Share Invoice"
              >
                <Share2 size={14} />
                <span>Share</span>
                <ChevronDown size={13} className={`transition-transform ${shareMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {shareMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-slate-200">
                  {/* WhatsApp */}
                  <button
                    onClick={handleShareWhatsAppText}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-700/80 flex items-center space-x-2.5 text-emerald-400 font-semibold transition"
                  >
                    <MessageSquare size={15} />
                    <span>WhatsApp (Text)</span>
                  </button>

                  {/* Email with PDF */}
                  <button
                    onClick={handleShareEmail}
                    disabled={sendingEmail}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-700/80 flex items-center space-x-2.5 text-blue-400 font-semibold transition disabled:opacity-50"
                  >
                    {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    <span>Email PDF Attachment</span>
                  </button>

                  {/* Telegram */}
                  <button
                    onClick={handleShareTelegram}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-700/80 flex items-center space-x-2.5 text-sky-400 font-semibold transition"
                  >
                    <Send size={15} />
                    <span>Telegram</span>
                  </button>

                  {/* SMS */}
                  <button
                    onClick={handleShareSMS}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-700/80 flex items-center space-x-2.5 text-amber-400 font-semibold transition"
                  >
                    <MessageSquare size={15} />
                    <span>SMS</span>
                  </button>

                  <div className="border-t border-slate-700 my-1"></div>

                  {/* Native Web Share */}
                  <button
                    onClick={handleNativeShare}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-700/80 flex items-center space-x-2.5 text-slate-300 font-semibold transition"
                  >
                    <Share2 size={15} />
                    <span>More Options / Copy</span>
                  </button>
                </div>
              )}
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow transition"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className={`px-6 py-2 text-xs font-semibold flex items-center justify-between print:hidden ${
            toastMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' :
            toastMsg.type === 'error' ? 'bg-rose-50 text-rose-800 border-b border-rose-200' :
            'bg-blue-50 text-blue-800 border-b border-blue-200'
          }`}>
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="text-slate-500 hover:text-slate-700 ml-2">×</button>
          </div>
        )}

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
            <div 
              ref={invoiceRef}
              className={`thermal-receipt font-mono text-slate-900 mx-auto p-4 border border-slate-200 rounded shadow-sm bg-white print:border-none print:shadow-none print:p-0 ${
                printFormat === 'thermal-58' ? 'max-w-[240px] print:w-[58mm] text-[11px]' : 'max-w-[320px] print:w-[80mm] text-xs'
              }`}
            >
              {/* Shop Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-400">
                <h2 className="text-sm font-extrabold uppercase tracking-wide">{shop.shop_name || 'ABC PRINTING CENTER'}</h2>
                <p className="text-[10px] text-slate-600">{shop.address || 'Main Road, Shop No. 12'}</p>
                <p className="text-[10px] text-slate-600">Ph: {shop.phone || '+91 98765 43210'}</p>
                {shop.gst_number && <p className="text-[10px] text-slate-600">GSTIN: {shop.gst_number}</p>}
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
                {customerEmail && (
                  <div className="flex justify-between text-[10px]">
                    <span>Email:</span>
                    <span>{customerEmail}</span>
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
                {(gstAmount > 0 || (billingConfig.gst_enabled && Number(billingConfig.gst_rate) > 0)) && (
                  <div className="flex justify-between text-slate-600">
                    <span>GST ({billingConfig.gst_rate}%):</span>
                    <span>+₹{gstAmount.toFixed(2)}</span>
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
                *** {shop.footer_message || 'Thank You for Visiting'} ***
                <br />Powered by PrintPro ERP
              </div>
            </div>
          )}

          {/* FORMAT 2: STANDARD A4 TAX INVOICE */}
          {printFormat === 'a4' && (
            <div 
              ref={invoiceRef}
              className="a4-invoice text-slate-800 p-6 border border-slate-200 rounded-lg bg-white print:border-none print:p-0 print:scale-[0.93] print:origin-top space-y-5"
            >
              {/* Header */}
              <div className="flex justify-between items-start pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 uppercase tracking-wide">
                    {billingConfig.gst_enabled ? 'TAX INVOICE' : 'INVOICE'}
                  </h1>
                  <p className="text-sm font-bold text-blue-600 mt-1">{shop.shop_name || 'ABC PRINTING CENTER'}</p>
                  <p className="text-xs text-slate-500">Photocopying, Printing, Lamination & Office Supplies</p>
                  <p className="text-xs text-slate-500">
                    {shop.address || 'Main Road, Shop No. 12'} • Ph: {shop.phone || '+91 98765 43210'}
                  </p>
                  {shop.gst_number && (
                    <p className="text-xs text-slate-600 font-mono">GSTIN: {shop.gst_number}</p>
                  )}
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
              <div className="p-3.5 bg-slate-50 rounded-xl text-xs grid grid-cols-2 gap-4 border border-slate-200 print:p-2.5">
                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wider">Billed To:</span>
                  <span className="text-base font-extrabold text-slate-900">{bill.customer_name || 'N/A'}</span>
                  {bill.customer_mobile ? (
                    <p className="text-slate-600 font-mono mt-0.5">Mobile: {bill.customer_mobile}</p>
                  ) : (
                    <p className="text-slate-400 italic mt-0.5">No registered phone number</p>
                  )}
                  {customerEmail && (
                    <p className="text-slate-600 text-[11px] mt-0.5">Email: {customerEmail}</p>
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
                    <th className="p-2 rounded-l">#</th>
                    <th className="p-2">Item & Description</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Unit Price</th>
                    <th className="p-2 text-right rounded-r">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {bill.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 text-slate-400 font-data-mono">{idx + 1}</td>
                      <td className="p-2 font-medium text-slate-800">{item.product_name}</td>
                      <td className="p-2 text-center font-data-mono">{item.quantity}</td>
                      <td className="p-2 text-right font-data-mono">₹{item.price.toFixed(2)}</td>
                      <td className="p-2 text-right font-data-mono font-bold text-slate-900">₹{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Current Bill Subtotal & Grand Total */}
              <div className="flex justify-end pt-1 border-t border-slate-200">
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
                  {(gstAmount > 0 || (billingConfig.gst_enabled && Number(billingConfig.gst_rate) > 0)) && (
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>GST ({billingConfig.gst_rate}%):</span>
                      <span className="text-blue-700">+₹{gstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {roundingAdj !== 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Rounding ({bill.rounding_method || 'Standard'}):</span>
                      <span>{roundingAdj >= 0 ? '+' : ''}₹{roundingAdj.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold pt-1.5 border-t border-slate-300 text-slate-900">
                    <span>Current Bill Total:</span>
                    <span>₹{grandTotalVal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* DEDICATED CUSTOMER ACCOUNT SUMMARY SECTION */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 print:p-2.5 print:space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-extrabold uppercase text-slate-900 tracking-wider">
                    Customer Account Summary
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isPending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {summary.payment_status === 'Fully Paid' ? 'Status : Fully Paid' : 'Status : Payment Pending'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs print:gap-2 print:text-[10px]">
                  {/* Ledger Summary */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 shadow-sm print:p-2">
                    <p className="font-bold text-slate-700 uppercase text-[9px] tracking-wider border-b pb-0.5 text-blue-600">1. Ledger Summary</p>
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
                    <div className="flex justify-between font-extrabold text-slate-900 pt-1 border-t border-slate-100">
                      <span>Total Amount Due:</span>
                      <span className="text-blue-700">₹{summary.total_amount_due.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 shadow-sm print:p-2">
                    <p className="font-bold text-slate-700 uppercase text-[9px] tracking-wider border-b pb-0.5 text-emerald-600">2. Payment Summary</p>
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
                    <div className="flex justify-between font-extrabold text-slate-900 pt-1 border-t border-slate-100">
                      <span>Total Paid:</span>
                      <span className="text-emerald-700">₹{summary.total_paid.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Balance Summary */}
                  <div className={`p-2.5 rounded-lg border space-y-1 shadow-sm print:p-2 ${
                    isPending ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/70 border-emerald-200'
                  }`}>
                    <p className={`font-bold uppercase text-[9px] tracking-wider border-b pb-0.5 ${
                      isPending ? 'text-amber-800 border-amber-200' : 'text-emerald-800 border-emerald-200'
                    }`}>
                      3. Balance Summary
                    </p>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Remaining Balance:</span>
                      <span className={`font-extrabold ${isPending ? 'text-amber-700' : 'text-emerald-700'}`}>
                        ₹{summary.remaining_balance.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[9px] text-right font-medium">
                      Status : {summary.payment_status}
                    </p>
                    <div className="flex justify-between text-slate-600 pt-0.5 border-t border-slate-200/60">
                      <span>Customer Advance:</span>
                      <span className="font-semibold text-slate-800">₹{summary.remaining_advance_balance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Loyalty Summary (If Enabled) */}
                {summary.loyalty && summary.loyalty.enabled && (
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm print:p-1.5 print:text-[10px]">
                    <div className="flex items-center space-x-2">
                      <span>{summary.remaining_balance === 0 || summary.loyalty.is_fully_paid ? '🎁' : '⏳'}</span>
                      <span className="font-bold text-slate-800 uppercase text-[9px] tracking-wider">Loyalty Summary</span>
                    </div>

                    {summary.remaining_balance === 0 || summary.loyalty.is_fully_paid ? (
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                          <span className="text-emerald-800 block text-[9px] font-bold">Loyalty Earned</span>
                          <span className="font-extrabold text-emerald-700 text-xs">+{summary.loyalty.points_earned} Pts</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">Previous Points</span>
                          <span className="font-bold text-slate-800">{summary.loyalty.previous_points} pts</span>
                        </div>
                        {summary.loyalty.points_redeemed > 0 && (
                          <div>
                            <span className="text-slate-500 block text-[9px]">Points Redeemed</span>
                            <span className="font-bold text-rose-600">-{summary.loyalty.points_redeemed} pts</span>
                          </div>
                        )}
                        <div className="bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                          <span className="text-slate-500 block text-[9px] font-bold uppercase">Balance</span>
                          <span className="font-extrabold text-blue-700 text-xs">{summary.loyalty.current_points_balance} pts</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 font-semibold text-[10px]">
                        ⏳ Loyalty Points will be credited after this bill is fully paid.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 text-center text-[11px] text-slate-500">
                {shop.footer_message || 'Thank you for visiting. Powered by PrintPro ERP'}
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
            <span>Share WhatsApp Receipt</span>
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
