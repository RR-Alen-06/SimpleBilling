'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Bill, CustomerSummary, DateFilterOption, AllSettings } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { downloadCSV } from '@/lib/utils/csv';
import { REPORTS_DATE_FILTER_BUTTONS } from '@/lib/constants/filters';
import { BusinessReportGenerator } from '@/lib/services/businessReportGenerator';
import { 
  BarChart3, 
  Printer, 
  Users, 
  Receipt,
  FileSpreadsheet,
  Filter,
  IndianRupee,
  CreditCard,
  Wallet,
  TrendingUp,
  Package,
  Download,
  FileText,
  Loader2
} from 'lucide-react';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'dues' | 'items'>('sales');
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [filteredBills, custSummaries, fetchedSettings] = await Promise.all([
        ApiService.getBillsByDateRange(dateFilter, { from: customFrom, to: customTo }),
        ApiService.getCustomerSummaries(),
        ApiService.getSettings()
      ]);
      setBills(filteredBills);
      setCustomers(custSummaries);
      setSettings(fetchedSettings);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReportData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customFrom, customTo]);

  // Aggregate Metrics for Current Filter
  const totalSales = bills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);
  const totalPaid = bills.reduce((sum, b) => sum + Math.min(Number(b.grand_total || 0), Number(b.paid_total || 0)), 0);
  const cashTotal = bills.reduce((sum, b) => sum + Number(b.cash_paid || 0), 0);
  const upiTotal = bills.reduce((sum, b) => sum + Number(b.upi_paid || 0), 0);
  // Customer due list & total ledger dues
  const dueCustomers = customers.filter(c => c.balance_due > 0);
  const totalDuesAmount = dueCustomers.reduce((sum, c) => sum + c.balance_due, 0);
  // Period-scoped pending balance dynamically calculated for the active date filter
  const pendingTotal = bills.reduce((sum, b) => {
    const g = Number(b.grand_total || 0);
    const p = Math.min(g, Number(b.paid_total || 0));
    return sum + Math.max(0, g - p);
  }, 0);
  const avgBill = bills.length > 0 ? totalSales / bills.length : 0;

  // Aggregate Product / Item sales
  const itemMap = new Map<string, { name: string; qty: number; total: number }>();
  bills.forEach(b => {
    b.items?.forEach(it => {
      const existing = itemMap.get(it.product_name) || { name: it.product_name, qty: 0, total: 0 };
      existing.qty += Number(it.quantity || 0);
      existing.total += Number(it.total || 0);
      itemMap.set(it.product_name, existing);
    });
  });
  const itemSales = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

  const getFilterLabel = () => {
    if (dateFilter === 'today') return 'Today';
    if (dateFilter === 'yesterday') return 'Yesterday';
    if (dateFilter === 'weekly') return 'Last 7 Days';
    if (dateFilter === 'monthly') return 'This Month';
    if (dateFilter === 'quarterly') return 'This Quarter';
    if (dateFilter === 'yearly') return 'This Year';
    if (dateFilter === 'financial_year') return 'Financial Year (FY)';
    if (dateFilter === 'custom') return `${customFrom || 'Start'} to ${customTo || 'End'}`;
    return 'All Time';
  };

  // Full Executive PDF Report Generator
  const handleExportPdfReport = () => {
    setGeneratingPdf(true);
    try {
      const periodLabel = getFilterLabel();
      const generatedAt = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const doc = BusinessReportGenerator.generateReportPdf({
        shop_settings: settings?.shop || {},
        period_label: periodLabel,
        generated_at: generatedAt,
        kpi: {
          total_sales: totalSales,
          total_paid: totalPaid,
          cash_total: cashTotal,
          upi_total: upiTotal,
          pending_total: pendingTotal,
          total_bills: bills.length,
          avg_bill_value: avgBill,
          total_customers_due: dueCustomers.length,
          total_dues_amount: totalDuesAmount
        },
        bills,
        item_sales: itemSales,
        due_customers: dueCustomers
      });

      const filename = `Business_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Failed to export PDF report:', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Full Multi-Section Consolidated CSV Export
  const handleExportFullCSV = () => {
    const filterLabel = getFilterLabel();
    const dateStr = new Date().toISOString().split('T')[0];
    
    const lines: string[] = [];
    
    // Header
    lines.push(`"${(settings?.shop?.shop_name || 'SimpleBilling Center').toUpperCase()} - COMPLETE BUSINESS REPORT"`);
    lines.push(`"Report Period: ${filterLabel} | Generated: ${new Date().toLocaleString('en-IN')}"`);
    lines.push('');
    
    // 1. KPI Summary
    lines.push('"--- 1. EXECUTIVE FINANCIAL SUMMARY ---"');
    lines.push('"Metric","Value (INR / Count)"');
    lines.push(`"Total Revenue (INR)","${totalSales.toFixed(2)}"`);
    lines.push(`"Total Amount Collected (INR)","${totalPaid.toFixed(2)}"`);
    lines.push(`"Cash Collections (INR)","${cashTotal.toFixed(2)}"`);
    lines.push(`"UPI Collections (INR)","${upiTotal.toFixed(2)}"`);
    lines.push(`"Period Unpaid Dues (INR)","${pendingTotal.toFixed(2)}"`);
    lines.push(`"Total Invoices Generated","${bills.length}"`);
    lines.push(`"Average Bill Value (INR)","${avgBill.toFixed(2)}"`);
    lines.push(`"Customers with Pending Dues","${dueCustomers.length}"`);
    lines.push(`"Total Ledger Dues Outstanding (INR)","${totalDuesAmount.toFixed(2)}"`);
    lines.push('');

    // 2. Sales Invoices Register
    lines.push(`"--- 2. SALES INVOICES REGISTER (${bills.length} Records) ---"`);
    lines.push('"Bill Number","Date Time","Customer Name","Mobile","Payment Mode","Grand Total (INR)","Paid Total (INR)","Status"');
    bills.forEach(b => {
      const isPaid = Number(b.paid_total || 0) >= Number(b.grand_total || 0) - 0.01;
      lines.push(`"${b.bill_number}","${new Date(b.created_at).toLocaleString('en-IN')}","${(b.customer_name || 'Walk-in').replace(/"/g, '""')}","${b.customer_mobile || ''}","${b.payment_method || 'Cash'}","${Number(b.grand_total || 0).toFixed(2)}","${Number(b.paid_total || 0).toFixed(2)}","${isPaid ? 'Paid' : 'Pending'}"`);
    });
    lines.push('');

    // 3. Item Sales Volume
    lines.push(`"--- 3. ITEM & SERVICE SALES VOLUME (${itemSales.length} Products) ---"`);
    lines.push('"Product / Service Name","Quantity Sold","Revenue Generated (INR)"');
    itemSales.forEach(it => {
      lines.push(`"${it.name.replace(/"/g, '""')}","${it.qty}","${it.total.toFixed(2)}"`);
    });
    lines.push('');

    // 4. Customer Outstanding Dues Ledger
    lines.push(`"--- 4. CUSTOMER OUTSTANDING DUES (${dueCustomers.length} Accounts) ---"`);
    lines.push('"Customer Name","Mobile","Email","Total Billed (INR)","Total Paid (INR)","Balance Due (INR)","Advance Balance (INR)"');
    dueCustomers.forEach(c => {
      lines.push(`"${c.name.replace(/"/g, '""')}","${c.mobile || ''}","${c.email || ''}","${Number(c.total_billed).toFixed(2)}","${Number(c.total_paid).toFixed(2)}","${Number(c.balance_due).toFixed(2)}","${Number(c.advance_balance).toFixed(2)}"`);
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(lines.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Full_Business_Report_${dateFilter}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tab-Specific CSV Export
  const handleExportTabCSV = () => {
    const filterLabel = dateFilter.replace('_', '-');
    if (activeTab === 'sales') {
      const headers = ['Bill Number', 'Date Time', 'Customer', 'Customer Mobile', 'Payment Method', 'Cash (INR)', 'UPI (INR)', 'Grand Total (INR)', 'Paid Total (INR)', 'Status'];
      const rows = bills.map(b => [
        b.bill_number,
        new Date(b.created_at).toLocaleString('en-IN'),
        b.customer_name || 'Walk-in',
        b.customer_mobile || '',
        b.payment_method || 'Cash',
        b.cash_paid || 0,
        b.upi_paid || 0,
        b.grand_total,
        b.paid_total,
        Number(b.paid_total) >= Number(b.grand_total) ? 'Paid' : 'Pending'
      ]);
      downloadCSV(`Sales_Register_${filterLabel}`, headers, rows);
    } else if (activeTab === 'items') {
      const headers = ['Product / Service Name', 'Quantity Sold', 'Revenue Generated (INR)'];
      const rows = itemSales.map(it => [
        it.name,
        it.qty,
        it.total.toFixed(2)
      ]);
      downloadCSV(`Item_Sales_Volume_${filterLabel}`, headers, rows);
    } else {
      const headers = ['Customer Name', 'Mobile Number', 'Email', 'Total Billed (INR)', 'Total Paid (INR)', 'Balance Due (INR)'];
      const rows = dueCustomers.map(c => [
        c.name,
        c.mobile || 'N/A',
        c.email || '',
        c.total_billed,
        c.total_paid,
        c.balance_due
      ]);
      downloadCSV(`Customer_Dues_Ledger_${new Date().toISOString().split('T')[0]}`, headers, rows);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const dateFilterButtons = REPORTS_DATE_FILTER_BUTTONS;

  return (
    <div className="reports-page-root space-y-6">
      <SupabaseBanner />

      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <BarChart3 className="text-blue-600" size={26} />
            <span>Business Reports & Analytics</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Comprehensive sales registers, volume analytics, and customer dues tracking</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Vector PDF Report Button */}
          <button
            onClick={handleExportPdfReport}
            disabled={loading || generatingPdf}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer"
            title="Download Executive Vector PDF Report"
          >
            {generatingPdf ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <FileText size={15} />
                <span>Download PDF Report</span>
              </>
            )}
          </button>

          {/* Full Report CSV Button */}
          <button
            onClick={handleExportFullCSV}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer"
            title="Export Full Multi-Section Business Report (CSV)"
          >
            <FileSpreadsheet size={15} />
            <span>Export Full CSV</span>
          </button>

          {/* Tab Specific CSV */}
          <button
            onClick={handleExportTabCSV}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2.5 rounded-lg border border-slate-300 transition flex items-center space-x-1 cursor-pointer"
            title="Export Active Tab Only (CSV)"
          >
            <Download size={14} />
            <span>Active Tab CSV</span>
          </button>

          {/* Print Report */}
          <button
            onClick={handlePrintReport}
            className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-3.5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Printer size={15} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* DATE RANGE FILTER STRIP */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter size={15} className="text-blue-600" />
            <span>Date Range:</span>
          </div>

          {/* Quick Date Pills */}
          <div className="flex flex-wrap gap-1.5">
            {dateFilterButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => setDateFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dateFilter === btn.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers */}
        {dateFilter === 'custom' && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">From:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-medium"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">To:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-medium"
              />
            </div>
          </div>
        )}
      </div>

      {/* METRIC CARDS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <IndianRupee size={13} className="text-blue-600" />
            <span>Total Sales</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900">₹{totalSales.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">{bills.length} bills generated</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-emerald-700 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <Wallet size={13} className="text-emerald-600" />
            <span>Cash Paid</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-emerald-700">₹{cashTotal.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">Direct cash collected</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-indigo-700 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <CreditCard size={13} className="text-indigo-600" />
            <span>UPI Paid</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-indigo-700">₹{upiTotal.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">Digital collections</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-amber-700 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <TrendingUp size={13} className="text-amber-600" />
            <span>Pending Balance</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-amber-700">₹{pendingTotal.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">Unpaid in period</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-slate-500 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <Receipt size={13} className="text-purple-600" />
            <span>Avg Bill Value</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-purple-700">₹{avgBill.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">Per invoice avg</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-rose-700 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1">
            <Users size={13} className="text-rose-600" />
            <span>Total Dues (All)</span>
          </div>
          <div className="text-base sm:text-lg font-extrabold text-rose-700">₹{totalDuesAmount.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400 font-medium">{dueCustomers.length} due customer{dueCustomers.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Report Section Tabs */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-2 print:hidden">
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg font-semibold text-xs transition ${
            activeTab === 'sales'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Receipt size={16} />
          <span>Sales & Bills ({bills.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg font-semibold text-xs transition ${
            activeTab === 'items'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package size={16} />
          <span>Product / Item Sales ({itemSales.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('dues')}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg font-semibold text-xs transition ${
            activeTab === 'dues'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={16} />
          <span>Customer Due List ({dueCustomers.length})</span>
        </button>
      </div>

      {/* REPORT CONTENT CARD */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 print:shadow-none print:border-none print:p-0">
        
        {/* TAB 1: SALES & BILLS */}
        {activeTab === 'sales' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sales Invoices & Transactions</h2>
                <p className="text-xs text-slate-500">Filtered Range: {dateFilter.replace('_', ' ').toUpperCase()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase font-semibold">Total Revenue</span>
                <p className="text-xl font-extrabold text-emerald-600">₹{totalSales.toFixed(2)}</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Generating report...</div>
            ) : bills.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Receipt className="mx-auto text-slate-300 mb-2" size={40} />
                <p className="font-medium text-slate-700">No bills found for the selected date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-4">Bill No</th>
                      <th className="py-2.5 px-4">Date & Time</th>
                      <th className="py-2.5 px-4">Customer</th>
                      <th className="py-2.5 px-4">Payment</th>
                      <th className="py-2.5 px-4 text-right">Cash</th>
                      <th className="py-2.5 px-4 text-right">UPI</th>
                      <th className="py-2.5 px-4 text-right">Total (₹)</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bills.map((b) => {
                      const isPaid = Number(b.paid_total || 0) >= Number(b.grand_total || 0);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.bill_number}</td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {new Date(b.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">{b.customer_name || 'Walk-in'}</td>
                          <td className="py-3 px-4 font-semibold text-xs uppercase">{b.payment_method}</td>
                          <td className="py-3 px-4 text-right text-xs font-mono text-emerald-700 font-semibold">
                            ₹{Number(b.cash_paid || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-mono text-indigo-700 font-semibold">
                            ₹{Number(b.upi_paid || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                            ₹{Number(b.grand_total).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isPaid ? 'Fully Paid' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRODUCT / ITEM SALES BREAKDOWN */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Product & Service Sales Breakdown</h2>
                <p className="text-xs text-slate-500">Units sold and revenue generated per product</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase font-semibold">Total Item Types</span>
                <p className="text-xl font-extrabold text-blue-600">{itemSales.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Aggregating items...</div>
            ) : itemSales.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Package className="mx-auto text-slate-300 mb-2" size={40} />
                <p className="font-medium text-slate-700">No item sales recorded for this period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Product / Item Name</th>
                      <th className="py-2.5 px-4 text-center">Total Quantity Sold</th>
                      <th className="py-2.5 px-4 text-right">Revenue Generated (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemSales.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-xs font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{it.name}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">{it.qty}</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700">₹{it.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CUSTOMER DUE LIST */}
        {activeTab === 'dues' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Customer Pending Dues List</h2>
                <p className="text-xs text-slate-500">Customers with outstanding running balances across all time</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase font-semibold">Total Outstanding Dues</span>
                <p className="text-xl font-extrabold text-rose-600">₹{totalDuesAmount.toFixed(2)}</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading pending dues list...</div>
            ) : dueCustomers.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Users className="mx-auto text-slate-300 mb-2" size={40} />
                <p className="font-medium text-slate-700">All customer dues settled!</p>
                <p className="text-xs text-slate-400 mt-1">No pending balances found across registered customers.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-4">Customer Name</th>
                      <th className="py-2.5 px-4">Mobile / Email</th>
                      <th className="py-2.5 px-4 text-right">Total Billed (₹)</th>
                      <th className="py-2.5 px-4 text-right">Total Paid (₹)</th>
                      <th className="py-2.5 px-4 text-right">Pending Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dueCustomers.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">
                          <div>{c.mobile || 'No mobile'}</div>
                          {c.email && <div className="text-blue-600">{c.email}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-800">₹{c.total_billed.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium text-emerald-700">₹{c.total_paid.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-rose-600">₹{c.balance_due.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
