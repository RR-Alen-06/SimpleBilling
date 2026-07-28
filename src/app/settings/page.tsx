'use client';

import React, { useState, useEffect } from 'react';
import { ApiService, DEFAULT_SETTINGS } from '@/lib/services/api';
import { AllSettings, RoundingMethod } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { 
  Settings as SettingsIcon, 
  Store, 
  Receipt, 
  Gift, 
  MessageSquare, 
  ShieldAlert, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Upload, 
  Trash2, 
  Lock 
} from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AllSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'shop' | 'billing' | 'loyalty' | 'whatsapp' | 'security' | 'backup'>('shop');
  const [loading, setLoading] = useState(true);

  // Super Admin Purge Modal
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [superAdminPin, setSuperAdminPin] = useState('');

  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSection = async (section: keyof AllSettings) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await ApiService.saveSettings(section, settings[section]);
      setSuccessMsg(`${section.toUpperCase()} settings saved successfully.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Backup & Restore
  const handleExportBackup = async () => {
    try {
      const bills = await ApiService.getBills();
      const customers = await ApiService.getCustomers();
      const products = await ApiService.getProducts();
      const expenses = await ApiService.getExpenses();
      const auditLogs = await ApiService.getAuditLogs();

      const backupData = {
        export_date: new Date().toISOString(),
        settings,
        customers,
        products,
        bills,
        expenses,
        auditLogs
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PrintPro_ERP_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessMsg('Database backup exported successfully.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export backup');
    }
  };

  // Super Admin Data Purge
  const handlePurgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (superAdminPin !== settings.security.super_admin_pin) {
      setErrorMsg('Invalid Super Admin Security PIN.');
      return;
    }

    if (purgeInput !== 'DELETE') {
      setErrorMsg('You must type DELETE in capital letters to confirm data purge.');
      return;
    }

    setSaving(true);
    try {
      await ApiService.purgeAllBusinessData('Super Admin');
      setSuccessMsg('All business transaction data has been permanently deleted.');
      setShowPurgeModal(false);
      setPurgeInput('');
      setSuperAdminPin('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to purge data');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <SettingsIcon className="text-blue-600" size={26} />
            <span>System Settings</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Shop branding, billing configuration, loyalty rules, backup & security</p>
        </div>
      </div>

      {/* Messages */}
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

      {/* SETTINGS TABS */}
      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-2">
        {[
          { id: 'shop', label: 'Shop Details', icon: Store },
          { id: 'billing', label: 'Billing Config', icon: Receipt },
          { id: 'loyalty', label: 'Loyalty Program', icon: Gift },
          { id: 'whatsapp', label: 'WhatsApp Receipts', icon: MessageSquare },
          { id: 'security', label: 'Security & Purge', icon: ShieldAlert },
          { id: 'backup', label: 'Backup & Restore', icon: Download }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT CARDS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading system settings...</div>
        ) : (
          <>
            {/* 1. SHOP DETAILS TAB */}
            {activeTab === 'shop' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Shop Information & Receipt Branding</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Name *</label>
                    <input
                      type="text"
                      value={settings.shop.shop_name}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, shop_name: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={settings.shop.phone}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, phone: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={settings.shop.email}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, email: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">GST Number (Optional)</label>
                    <input
                      type="text"
                      value={settings.shop.gst_number}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, gst_number: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Address</label>
                    <input
                      type="text"
                      value={settings.shop.address}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, address: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Footer Receipt Message</label>
                    <input
                      type="text"
                      value={settings.shop.footer_message}
                      onChange={(e) => setSettings({ ...settings, shop: { ...settings.shop, footer_message: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t flex justify-end">
                  <button
                    onClick={() => handleSaveSection('shop')}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Save size={16} />
                    <span>Save Shop Settings</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. BILLING CONFIG TAB */}
            {activeTab === 'billing' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Billing Rules & Rounding Config</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Bill Prefix</label>
                    <input
                      type="text"
                      value={settings.billing.bill_prefix}
                      onChange={(e) => setSettings({ ...settings, billing: { ...settings.billing, bill_prefix: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Symbol</label>
                    <input
                      type="text"
                      value={settings.billing.currency_symbol}
                      onChange={(e) => setSettings({ ...settings, billing: { ...settings.billing, currency_symbol: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Rounding Method</label>
                    <select
                      value={settings.billing.rounding_method}
                      onChange={(e) => setSettings({ ...settings, billing: { ...settings.billing, rounding_method: e.target.value as RoundingMethod } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="None">No Rounding</option>
                      <option value="Round Down">Round Down</option>
                      <option value="Round Up">Round Up</option>
                      <option value="Standard">Standard Rounding</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Default Printer Size</label>
                    <select
                      value={settings.billing.default_printer_size}
                      onChange={(e) => setSettings({ ...settings, billing: { ...settings.billing, default_printer_size: e.target.value as '80mm' | 'A4' } })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="80mm">Thermal POS (80mm)</option>
                      <option value="A4">Standard A4 Tax Invoice</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t flex justify-end">
                  <button
                    onClick={() => handleSaveSection('billing')}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Save size={16} />
                    <span>Save Billing Rules</span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. LOYALTY PROGRAM TAB */}
            {activeTab === 'loyalty' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Customer Loyalty Program Settings</h2>
                <div className="flex items-center space-x-3 bg-purple-50 p-4 rounded-xl border border-purple-200">
                  <input
                    type="checkbox"
                    id="loyalty_enable"
                    checked={settings.loyalty.enabled}
                    onChange={(e) => setSettings({ ...settings, loyalty: { ...settings.loyalty, enabled: e.target.checked } })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <label htmlFor="loyalty_enable" className="text-sm font-bold text-purple-900">
                    Enable Customer Loyalty Program
                  </label>
                </div>

                {settings.loyalty.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Earning Rule (₹ Spent per 1 Point)</label>
                      <input
                        type="number"
                        min="1"
                        value={settings.loyalty.points_per_amount}
                        onChange={(e) => setSettings({ ...settings, loyalty: { ...settings.loyalty, points_per_amount: Number(e.target.value) } })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Example: 100 means customer earns 1 point for every ₹100 billed.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Redemption Rate (₹ Discount per 1 Point)</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={settings.loyalty.amount_per_point}
                        onChange={(e) => setSettings({ ...settings, loyalty: { ...settings.loyalty, amount_per_point: Number(e.target.value) } })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Example: 1 means 1 point equals ₹1 discount during billing.</p>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t flex justify-end">
                  <button
                    onClick={() => handleSaveSection('loyalty')}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Save size={16} />
                    <span>Save Loyalty Settings</span>
                  </button>
                </div>
              </div>
            )}

            {/* 4. WHATSAPP TAB */}
            {activeTab === 'whatsapp' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">WhatsApp Receipt Integration</h2>
                <div className="flex items-center space-x-3 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <input
                    type="checkbox"
                    id="wa_enable"
                    checked={settings.whatsapp.enabled}
                    onChange={(e) => setSettings({ ...settings, whatsapp: { ...settings.whatsapp, enabled: e.target.checked } })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <label htmlFor="wa_enable" className="text-sm font-bold text-emerald-900">
                    Enable WhatsApp Receipt Sharing
                  </label>
                </div>

                <div className="pt-3 border-t flex justify-end">
                  <button
                    onClick={() => handleSaveSection('whatsapp')}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Save size={16} />
                    <span>Save WhatsApp Config</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. SECURITY & SUPER ADMIN PURGE TAB */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Security PIN & Super Admin Data Purge</h2>

                <div className="bg-rose-50 border-l-4 border-rose-500 p-5 rounded-r-xl space-y-3">
                  <div className="flex items-center space-x-2 text-rose-900 font-extrabold text-base">
                    <ShieldAlert size={22} className="text-rose-600" />
                    <span>Super Admin High-Risk Actions</span>
                  </div>
                  <p className="text-xs text-rose-800">
                    Permanently delete all business transactional records (bills, items, payments, expenses, ledgers, loyalty) while preserving shop settings.
                  </p>
                  <button
                    onClick={() => setShowPurgeModal(true)}
                    className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Trash2 size={16} />
                    <span>Delete All Data</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. BACKUP & RESTORE TAB */}
            {activeTab === 'backup' && (
              <div className="space-y-5">
                <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Database Backup & Export</h2>
                <p className="text-xs text-slate-600">Export complete business data (customers, products, bills, expenses, audit logs) into a portable JSON backup file.</p>

                <div className="pt-2">
                  <button
                    onClick={handleExportBackup}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-3 rounded-lg shadow transition flex items-center space-x-2"
                  >
                    <Download size={18} />
                    <span>Download Database JSON Backup</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* DELETE ALL DATA CONFIRMATION MODAL */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="text-center space-y-2">
              <AlertTriangle className="mx-auto text-rose-600" size={44} />
              <h3 className="text-xl font-extrabold text-slate-900">DELETE ALL BUSINESS DATA</h3>
              <p className="text-xs text-rose-700 font-semibold">
                WARNING: This will permanently wipe all bills, payments, customer ledgers, expenses, and audit history from the database!
              </p>
            </div>

            <form onSubmit={handlePurgeSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Super Admin Security PIN</label>
                <input
                  type="password"
                  required
                  placeholder="Enter PIN (Default: 1234)"
                  value={superAdminPin}
                  onChange={(e) => setSuperAdminPin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Type <span className="text-rose-600 font-mono">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  required
                  placeholder="DELETE"
                  value={purgeInput}
                  onChange={(e) => setPurgeInput(e.target.value)}
                  className="w-full bg-slate-50 border border-rose-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-rose-700 uppercase"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowPurgeModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || purgeInput !== 'DELETE'}
                  className="px-5 py-2 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg shadow"
                >
                  {saving ? 'Purging...' : 'PERMANENTLY PURGE DATA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
