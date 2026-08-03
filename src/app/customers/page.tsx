'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ApiService } from '@/lib/services/api';
import { CustomerSummary } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  Users, 
  UserPlus, 
  Edit2, 
  BookOpen, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  X,
  Phone
} from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');

  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getCustomerSummaries();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCustomers();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setMobile('');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleOpenEdit = (cust: CustomerSummary) => {
    setEditingId(cust.id);
    setName(cust.name);
    setMobile(cust.mobile || '');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Customer name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await ApiService.updateCustomer(editingId, { name: name.trim(), mobile: mobile.trim() || undefined });
        setSuccessMsg('Customer updated successfully.');
      } else {
        await ApiService.addCustomer({ name: name.trim(), mobile: mobile.trim() || undefined });
        setSuccessMsg('Customer created successfully.');
      }
      setShowModal(false);
      loadCustomers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.mobile && c.mobile.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <Users className="text-blue-600" size={26} />
            <span>Customer Directory & Ledgers</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage customer accounts, phone numbers, and running ledger dues</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <UserPlus size={18} />
          <span>Add Customer</span>
        </button>
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

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search customer name or mobile number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-sm focus:outline-none text-slate-800"
        />
      </div>

      {/* CUSTOMERS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading customer directory...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="font-medium text-base text-slate-700">No customers found.</p>
            <p className="text-xs text-slate-400 mt-1">Register customer names to track credit billing and ledger balances.</p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow inline-flex items-center space-x-1.5"
            >
              <UserPlus size={14} />
              <span>Add First Customer</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3.5">Customer Name</th>
                  <th className="px-6 py-3.5">Mobile Number</th>
                  <th className="px-6 py-3.5 text-right">Total Billed</th>
                  <th className="px-6 py-3.5 text-right">Total Paid</th>
                  <th className="px-6 py-3.5 text-right">Balance Due</th>
                  <th className="px-6 py-3.5 text-center w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-slate-800">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{cust.name}</td>
                    <td className="px-6 py-4 text-xs font-data-mono text-slate-600">
                      {cust.mobile ? (
                        <span className="flex items-center space-x-1">
                          <Phone size={12} className="text-slate-400" />
                          <span>{cust.mobile}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-data-mono font-semibold text-slate-800">
                      ₹{cust.total_billed.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-data-mono font-semibold text-emerald-700">
                      ₹{cust.total_paid.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-data-mono font-bold ${
                        cust.balance_due > 0 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        ₹{cust.balance_due.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Link
                          href={`/customers/${cust.id}`}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
                        >
                          <BookOpen size={13} />
                          <span>Ledger</span>
                        </Link>
                        <button
                          onClick={() => handleOpenEdit(cust)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                          title="Edit Customer Info"
                        >
                          <Edit2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT CUSTOMER MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Customer Details' : 'Add New Customer'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
