'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Bill, CustomerSummary } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  BarChart3, 
  Download, 
  Printer, 
  Calendar, 
  Users, 
  Receipt,
  FileSpreadsheet
} from 'lucide-react';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'dues'>('daily');
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [allBills, custSummaries] = await Promise.all([
        ApiService.getBills(),
        ApiService.getCustomerSummaries()
      ]);
      setBills(allBills);
      setCustomers(custSummaries);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter daily sales (today)
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyBills = bills.filter(b => b.created_at.startsWith(todayStr));
  const dailyTotal = dailyBills.reduce((sum, b) => sum + Number(b.grand_total), 0);

  // Monthly bills (current month)
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthlyBills = bills.filter(b => b.created_at.startsWith(currentMonthStr));
  const monthlyTotal = monthlyBills.reduce((sum, b) => sum + Number(b.grand_total), 0);

  // Customer due list
  const dueCustomers = customers.filter(c => c.balance_due > 0);
  const totalDuesAmount = dueCustomers.reduce((sum, c) => sum + c.balance_due, 0);

  // CSV Export Helper
  const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
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
    if (activeTab === 'daily') {
      const headers = ['Bill Number', 'Date Time', 'Customer', 'Payment Method', 'Grand Total (INR)'];
      const rows = dailyBills.map(b => [
        b.bill_number,
        new Date(b.created_at).toLocaleString('en-IN'),
        b.customer_name || 'N/A',
        b.payment_method,
        b.grand_total
      ]);
      exportToCSV(`Daily_Sales_Report_${todayStr}`, headers, rows);
    } else if (activeTab === 'monthly') {
      const headers = ['Bill Number', 'Date Time', 'Customer', 'Payment Method', 'Grand Total (INR)'];
      const rows = monthlyBills.map(b => [
        b.bill_number,
        new Date(b.created_at).toLocaleString('en-IN'),
        b.customer_name || 'N/A',
        b.payment_method,
        b.grand_total
      ]);
      exportToCSV(`Monthly_Sales_Report_${currentMonthStr}`, headers, rows);
    } else {
      const headers = ['Customer Name', 'Mobile Number', 'Total Billed (INR)', 'Total Paid (INR)', 'Balance Due (INR)'];
      const rows = dueCustomers.map(c => [
        c.name,
        c.mobile || 'N/A',
        c.total_billed,
        c.total_paid,
        c.balance_due
      ]);
      exportToCSV(`Customer_Due_List_${todayStr}`, headers, rows);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <BarChart3 className="text-blue-600" size={26} />
            <span>Business Reports</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Generate daily sales, monthly revenue, and customer due lists</p>
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

      {/* Report Tabs */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-2 print:hidden">
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg font-semibold text-xs transition ${
            activeTab === 'daily'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Receipt size={16} />
          <span>Daily Sales</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg font-semibold text-xs transition ${
            activeTab === 'monthly'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar size={16} />
          <span>Monthly Sales</span>
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
          <span>Customer Due List</span>
        </button>
      </div>

      {/* PRINTABLE REPORT CARD */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 print:shadow-none print:border-none print:p-0">
        
        {/* TAB 1: DAILY SALES */}
        {activeTab === 'daily' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Daily Sales Summary</h2>
                <p className="text-xs text-slate-500">Date: {new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase font-semibold">Total Revenue Today</span>
                <p className="text-xl font-extrabold text-emerald-600">₹{dailyTotal.toFixed(2)}</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Generating daily report...</div>
            ) : dailyBills.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Receipt className="mx-auto text-slate-300 mb-2" size={40} />
                <p className="font-medium text-slate-700">No bills generated today.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Bill No</th>
                    <th className="py-2.5 px-4">Time</th>
                    <th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4">Method</th>
                    <th className="py-2.5 px-4 text-right">Grand Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyBills.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.bill_number}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(b.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">{b.customer_name}</td>
                      <td className="py-3 px-4 font-semibold text-xs">{b.payment_method}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">₹{Number(b.grand_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: MONTHLY SALES */}
        {activeTab === 'monthly' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Monthly Sales Summary</h2>
                <p className="text-xs text-slate-500">Month: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Total Monthly Sales</span>
                <p className="text-xl font-data-mono font-extrabold text-blue-600">₹{monthlyTotal.toFixed(2)}</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Generating monthly report...</div>
            ) : monthlyBills.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Calendar className="mx-auto text-slate-300 mb-2" size={40} />
                <p className="font-medium text-slate-700">No sales recorded for this month.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Bill No</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4">Payment Method</th>
                    <th className="py-2.5 px-4 text-right">Grand Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyBills.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.bill_number}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="py-3 px-4">{b.customer_name}</td>
                      <td className="py-3 px-4 font-semibold text-xs">{b.payment_method}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">₹{Number(b.grand_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: CUSTOMER DUE LIST */}
        {activeTab === 'dues' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Customer Pending Dues List</h2>
                <p className="text-xs text-slate-500">Customers with outstanding running balance</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 uppercase font-semibold">Total Outstanding Dues</span>
                <p className="text-xl font-extrabold text-amber-600">₹{totalDuesAmount.toFixed(2)}</p>
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
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Customer Name</th>
                    <th className="py-2.5 px-4">Mobile</th>
                    <th className="py-2.5 px-4 text-right">Total Billed (₹)</th>
                    <th className="py-2.5 px-4 text-right">Total Paid (₹)</th>
                    <th className="py-2.5 px-4 text-right">Pending Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dueCustomers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-600">{c.mobile || 'N/A'}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-800">₹{c.total_billed.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-700">₹{c.total_paid.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-amber-600">₹{c.balance_due.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
