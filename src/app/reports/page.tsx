'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Bill, CustomerSummary, DateFilterOption } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
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
  Package
} from 'lucide-react';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'dues' | 'items'>('sales');
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [filteredBills, custSummaries] = await Promise.all([
        ApiService.getBillsByDateRange(dateFilter, { from: customFrom, to: customTo }),
        ApiService.getCustomerSummaries()
      ]);
      setBills(filteredBills);
      setCustomers(custSummaries);
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
  const totalPaid = bills.reduce((sum, b) => sum + Number(b.paid_total || 0), 0);
  const cashTotal = bills.reduce((sum, b) => sum + Number(b.cash_paid || 0), 0);
  const upiTotal = bills.reduce((sum, b) => sum + Number(b.upi_paid || 0), 0);
  const pendingTotal = Math.max(0, totalSales - totalPaid);
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

  // Customer due list
  const dueCustomers = customers.filter(c => c.balance_due > 0);
  const totalDuesAmount = dueCustomers.reduce((sum, c) => sum + c.balance_due, 0);

  // CSV Export Helper
  const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    const filterLabel = dateFilter.replace('_', '-');
    if (activeTab === 'sales') {
      const headers = ['Bill Number', 'Date Time', 'Customer', 'Customer Mobile', 'Payment Method', 'Cash (INR)', 'UPI (INR)', 'Grand Total (INR)', 'Paid Total (INR)', 'Status'];
      const rows = bills.map(b => [
        b.bill_number,
        new Date(b.created_at).toLocaleString('en-IN'),
        b.customer_name || 'Walk-in',
        b.customer_mobile || '',
        b.payment_method,
        b.cash_paid || 0,
        b.upi_paid || 0,
        b.grand_total,
        b.paid_total,
        Number(b.paid_total) >= Number(b.grand_total) ? 'Paid' : 'Pending'
      ]);
      exportToCSV(`Sales_Report_${filterLabel}`, headers, rows);
    } else if (activeTab === 'items') {
      const headers = ['Product / Service Name', 'Quantity Sold', 'Revenue Generated (INR)'];
      const rows = itemSales.map(it => [
        it.name,
        it.qty,
        it.total.toFixed(2)
      ]);
      exportToCSV(`Item_Sales_Report_${filterLabel}`, headers, rows);
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
      exportToCSV(`Customer_Due_List_${new Date().toISOString().split('T')[0]}`, headers, rows);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const dateFilterButtons: { id: DateFilterOption; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'weekly', label: 'This Week' },
    { id: 'monthly', label: 'This Month' },
    { id: 'quarterly', label: 'Quarter' },
    { id: 'financial_year', label: 'Financial Year' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <BarChart3 className="text-blue-600" size={26} />
            <span>Business Reports & Analytics</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Filter sales by date range, analyze item volume, and track customer dues</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
          >
            <FileSpreadsheet size={16} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrintReport}
            className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
          >
            <Printer size={16} />
            <span>Print Report</span>
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
          <div className="text-[10px] text-slate-400 font-medium">Unpaid balance</div>
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
          <div className="text-[10px] text-slate-400 font-medium">{dueCustomers.length} customers</div>
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
