'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Expense, ExpenseCategory, DateFilterOption } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  PieChart,
  Filter,
  Search,
  FileSpreadsheet
} from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = ['Shop Expense', 'Electricity', 'Rent', 'Other Expense'];

const dateFilterButtons: { id: DateFilterOption; label: string }[] = [
  { id: 'all_time', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'This Week' },
  { id: 'monthly', label: 'This Month' },
  { id: 'yearly', label: 'This Year' },
  { id: 'financial_year', label: 'Financial Year' },
  { id: 'custom', label: 'Custom' },
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all_time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<ExpenseCategory>('Shop Expense');

  // Delete modal state
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  // Feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [expData, stats] = await Promise.all([
        ApiService.getExpenses(),
        ApiService.getDashboardStats(dateFilter, { from: customFrom, to: customTo })
      ]);
      setExpenses(expData);
      setTotalIncome(stats.total_income);
      setTotalExpense(stats.total_expense);
    } catch (err) {
      console.error('Error fetching expenses & accounting stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, customFrom, customTo]);

  const handleOpenAdd = () => {
    setTitle('');
    setAmount('');
    setCategory('Shop Expense');
    setErrorMsg('');
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!title.trim()) {
      setErrorMsg('Expense title is required.');
      return;
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Amount must be greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.addExpense({
        title: title.trim(),
        amount: amt,
        category
      });
      setSuccessMsg('Expense recorded successfully.');
      setShowAddModal(false);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingExpense) return;
    try {
      await ApiService.deleteExpense(deletingExpense.id);
      setSuccessMsg('Expense record removed.');
      setDeletingExpense(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete expense');
    }
  };

  // Filter expenses list by date, category, and search query
  const dateBounds = ApiService.getDateRangeBounds(dateFilter, { from: customFrom, to: customTo });
  const filteredExpenses = expenses.filter((exp) => {
    const expDate = new Date(exp.created_at);
    if (dateBounds.startDate && expDate < dateBounds.startDate) return false;
    if (dateBounds.endDate && expDate > dateBounds.endDate) return false;
    if (selectedCategory !== 'ALL' && exp.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!exp.title.toLowerCase().includes(q) && !exp.category.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const periodExpenseSum = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const effectiveExpense = dateFilter === 'all_time' && selectedCategory === 'ALL' && !searchQuery ? totalExpense : periodExpenseSum;
  const netProfit = totalIncome - effectiveExpense;

  const handleExportCSV = () => {
    const headers = ['Expense Number', 'Date Time', 'Description', 'Category', 'Amount (INR)'];
    const rows = filteredExpenses.map(e => [
      e.expense_number || 'N/A',
      new Date(e.created_at).toLocaleString('en-IN'),
      e.title,
      e.category,
      Number(e.amount).toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expenses_Report_${dateFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <DollarSign className="text-blue-600" size={26} />
            <span>Simple Accounting & Expenses</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Track shop electricity, paper stock purchases, rent, and calculate net profit</p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {filteredExpenses.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs px-3.5 py-2.5 rounded-lg shadow-sm transition flex items-center space-x-1.5 cursor-pointer"
              title="Export filtered expenses to CSV"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus size={16} />
            <span>Record Expense</span>
          </button>
        </div>
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

      {/* DATE RANGE & PERIOD FILTER STRIP */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter size={15} className="text-blue-600" />
            <span>Period:</span>
          </div>

          {/* Quick Date Pills */}
          <div className="flex flex-wrap gap-1.5">
            {dateFilterButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => setDateFilter(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
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

      {/* FINANCIAL PROFIT & LOSS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Income (Sales)</p>
            <p className="text-2xl font-data-mono font-extrabold text-emerald-600 mt-1">₹{totalIncome.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{dateFilter.replace('_', ' ')} revenue</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Expenses</p>
            <p className="text-2xl font-data-mono font-extrabold text-rose-600 mt-1">₹{effectiveExpense.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{dateFilter.replace('_', ' ')} expenditures</p>
          </div>
          <div className="bg-rose-50 text-rose-600 p-3 rounded-xl border border-rose-100">
            <TrendingDown size={24} />
          </div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Net Profit</p>
            <p className={`text-2xl font-data-mono font-extrabold mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ₹{netProfit.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {netProfit >= 0 ? 'Net positive earnings' : 'Net operating deficit'}
            </p>
          </div>
          <div className="bg-slate-800 text-blue-400 p-3 rounded-xl border border-slate-700">
            <PieChart size={24} />
          </div>
        </div>
      </div>

      {/* EXPENSES SEARCH & CATEGORY FILTER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <DollarSign className="text-rose-600" size={20} />
            <h2 className="font-bold text-slate-800 text-base">Shop Expense Log</h2>
            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {filteredExpenses.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Category Select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <DollarSign className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="font-medium text-base text-slate-700">No expenses found for the selected period.</p>
            <p className="text-xs text-slate-400 mt-1">Try changing the date period, category filter, or record a new expense.</p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow inline-flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Record Expense</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3.5">Expense #</th>
                  <th className="px-6 py-3.5">Date & Time</th>
                  <th className="px-6 py-3.5">Expense Description</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5 text-right">Amount</th>
                  <th className="px-6 py-3.5 text-center w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-slate-800">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 text-xs font-data-mono font-bold text-slate-500">
                      {exp.expense_number || 'EXP-—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-data-mono text-slate-500">
                      {new Date(exp.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">{exp.title}</td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-data-mono font-bold text-rose-600 text-base">
                      ₹{Number(exp.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setDeletingExpense(exp)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition mx-auto cursor-pointer"
                        title="Delete Expense"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD EXPENSE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Record Shop Expense</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expense Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Purchased A4 Paper Rim, Shop Electricity Bill"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 text-center">
            <AlertTriangle className="mx-auto text-rose-600" size={40} />
            <h3 className="text-lg font-bold text-slate-900">Confirm Expense Deletion</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to remove <span className="font-bold text-slate-900">&quot;{deletingExpense.title}&quot;</span> (₹{Number(deletingExpense.amount).toFixed(2)})?
            </p>
            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => setDeletingExpense(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
