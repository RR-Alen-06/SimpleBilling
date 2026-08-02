'use client';

import React, { useState, useEffect } from 'react';
import { ApiService, DEFAULT_SETTINGS } from '@/lib/services/api';
import { AllSettings, RoundingMethod, SequenceConfig, LoyaltyRule, LoyaltyRedemptionRule } from '@/lib/types';
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
  Trash2,
  Hash,
  Plus,
  Edit2,
  X,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AllSettings>(DEFAULT_SETTINGS);
  const [sequences, setSequences] = useState<SequenceConfig[]>([]);
  const [loyaltyRules, setLoyaltyRules] = useState<LoyaltyRule[]>([]);
  const [redemptionRules, setRedemptionRules] = useState<LoyaltyRedemptionRule[]>([]);
  const [activeTab, setActiveTab] = useState<'shop' | 'billing' | 'sequence' | 'loyalty' | 'whatsapp' | 'security' | 'backup'>('shop');
  const [loading, setLoading] = useState(true);

  // Loyalty Earning Rule Modal state
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<LoyaltyRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [minBill, setMinBill] = useState<number | ''>(0);
  const [maxBill, setMaxBill] = useState<number | ''>('');
  const [pointsEarnedInput, setPointsEarnedInput] = useState<number | ''>(1);
  const [sortOrder, setSortOrder] = useState<number>(1);

  // Loyalty Redemption Rule Modal state
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [editingRedemptionRule, setEditingRedemptionRule] = useState<LoyaltyRedemptionRule | null>(null);
  const [ptsRequiredInput, setPtsRequiredInput] = useState<number | ''>(10);
  const [discAmountInput, setDiscAmountInput] = useState<number | ''>(5);

  // Super Admin Purge Modal
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [superAdminPin, setSuperAdminPin] = useState('');

  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [data, seqList, ruleList, redList] = await Promise.all([
        ApiService.getSettings(),
        ApiService.getSequences(),
        ApiService.getLoyaltyRules(),
        ApiService.getLoyaltyRedemptionRules()
      ]);
      setSettings(data);
      setSequences(seqList);
      setLoyaltyRules(ruleList);
      setRedemptionRules(redList);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (isMounted) {
        await loadSettings();
      }
    };
    void run();
    return () => { isMounted = false; };
  }, []);

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

  const handleSaveSequenceItem = async (seq: SequenceConfig) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await ApiService.updateSequenceConfig(seq.key, seq.prefix, seq.padding);
      setSuccessMsg(`Sequence counter for ${seq.key} updated.`);
      await loadSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update sequence');
    } finally {
      setSaving(false);
    }
  };

  // Loyalty Earning Rule Handlers
  const handleOpenAddRule = () => {
    setEditingRule(null);
    setRuleName('');
    setMinBill(0);
    setMaxBill('');
    setPointsEarnedInput(1);
    setSortOrder(loyaltyRules.length + 1);
    setErrorMsg('');
    setShowRuleModal(true);
  };

  const handleOpenEditRule = (rule: LoyaltyRule) => {
    setEditingRule(rule);
    setRuleName(rule.rule_name);
    setMinBill(rule.min_bill_amount);
    setMaxBill(rule.max_bill_amount ?? '');
    setPointsEarnedInput(rule.points_earned);
    setSortOrder(rule.sort_order);
    setErrorMsg('');
    setShowRuleModal(true);
  };

  const handleSaveRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!ruleName.trim()) {
      setErrorMsg('Rule name is required.');
      return;
    }

    const minVal = Number(minBill);
    if (isNaN(minVal) || minVal < 0) {
      setErrorMsg('Minimum bill amount cannot be negative.');
      return;
    }

    const maxVal = maxBill === '' ? null : Number(maxBill);
    if (maxVal !== null && maxVal < minVal) {
      setErrorMsg('Maximum bill amount must be greater than minimum bill amount.');
      return;
    }

    const ptsVal = Number(pointsEarnedInput);
    if (isNaN(ptsVal) || ptsVal <= 0) {
      setErrorMsg('Points earned must be greater than 0.');
      return;
    }

    setSaving(true);
    try {
      if (editingRule) {
        await ApiService.updateLoyaltyRule(editingRule.id, {
          rule_name: ruleName.trim(),
          min_bill_amount: minVal,
          max_bill_amount: maxVal,
          points_earned: ptsVal,
          sort_order: sortOrder
        });
        setSuccessMsg('Loyalty earning rule updated.');
      } else {
        await ApiService.addLoyaltyRule({
          rule_name: ruleName.trim(),
          min_bill_amount: minVal,
          max_bill_amount: maxVal,
          points_earned: ptsVal,
          enabled: true,
          sort_order: sortOrder
        });
        setSuccessMsg('Loyalty earning rule created.');
      }
      setShowRuleModal(false);
      await loadSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save loyalty rule');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule: LoyaltyRule) => {
    try {
      await ApiService.updateLoyaltyRule(rule.id, { enabled: !rule.enabled });
      await loadSettings();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await ApiService.deleteLoyaltyRule(id);
      setSuccessMsg('Loyalty rule deleted.');
      await loadSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  // Loyalty Redemption Rule Handlers
  const handleOpenAddRedemptionRule = () => {
    setEditingRedemptionRule(null);
    setPtsRequiredInput(10);
    setDiscAmountInput(5);
    setErrorMsg('');
    setShowRedemptionModal(true);
  };

  const handleOpenEditRedemptionRule = (rule: LoyaltyRedemptionRule) => {
    setEditingRedemptionRule(rule);
    setPtsRequiredInput(rule.points_required);
    setDiscAmountInput(rule.discount_amount);
    setErrorMsg('');
    setShowRedemptionModal(true);
  };

  const handleSaveRedemptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const pts = Number(ptsRequiredInput);
    const disc = Number(discAmountInput);

    if (isNaN(pts) || pts <= 0) {
      setErrorMsg('Points required must be greater than 0.');
      return;
    }

    if (isNaN(disc) || disc <= 0) {
      setErrorMsg('Discount amount must be greater than 0.');
      return;
    }

    setSaving(true);
    try {
      if (editingRedemptionRule) {
        await ApiService.updateLoyaltyRedemptionRule(editingRedemptionRule.id, {
          points_required: pts,
          discount_amount: disc
        });
        setSuccessMsg('Redemption rule updated.');
      } else {
        await ApiService.addLoyaltyRedemptionRule({
          points_required: pts,
          discount_amount: disc,
          enabled: true
        });
        setSuccessMsg('Redemption rule added.');
      }
      setShowRedemptionModal(false);
      await loadSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save redemption rule');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRedemptionRule = async (rule: LoyaltyRedemptionRule) => {
    try {
      await ApiService.updateLoyaltyRedemptionRule(rule.id, { enabled: !rule.enabled });
      await loadSettings();
    } catch (err) {
      console.error('Failed to toggle redemption rule:', err);
    }
  };

  const handleDeleteRedemptionRule = async (id: string) => {
    try {
      await ApiService.deleteLoyaltyRedemptionRule(id);
      setSuccessMsg('Redemption rule deleted.');
      await loadSettings();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete redemption rule');
    }
  };

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
        sequences,
        loyaltyRules,
        redemptionRules,
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
            <span>System Settings & Loyalty Engine</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Shop details, atomic database sequences, point redemption rules, and security</p>
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
          { id: 'sequence', label: 'Sequence Management', icon: Hash },
          { id: 'loyalty', label: 'Loyalty Engine', icon: Gift },
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

            {/* 3. DEDICATED SEQUENCE MANAGEMENT TAB */}
            {activeTab === 'sequence' && (
              <div className="space-y-5">
                <div className="border-b pb-2">
                  <h2 className="text-lg font-bold text-slate-900">Database Sequence Counter Management</h2>
                  <p className="text-xs text-slate-500 mt-1">Configure atomic database prefixes and numeric padding (e.g., BILL-000001) for all entities.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 uppercase text-xs font-bold border-b">
                        <th className="py-2.5 px-4">Entity Key</th>
                        <th className="py-2.5 px-4">Prefix</th>
                        <th className="py-2.5 px-4 text-center">Padding Length</th>
                        <th className="py-2.5 px-4 text-right">Current Counter</th>
                        <th className="py-2.5 px-4 text-center">Preview Format</th>
                        <th className="py-2.5 px-4 text-center w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sequences.map((seq, idx) => (
                        <tr key={seq.key} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{seq.key}</td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={seq.prefix}
                              onChange={(e) => {
                                const updated = [...sequences];
                                updated[idx].prefix = e.target.value.toUpperCase();
                                setSequences(updated);
                              }}
                              className="w-24 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={seq.padding}
                              onChange={(e) => {
                                const updated = [...sequences];
                                updated[idx].padding = Number(e.target.value);
                                setSequences(updated);
                              }}
                              className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                            >
                              <option value={4}>4 Digits (0001)</option>
                              <option value={6}>6 Digits (000001)</option>
                              <option value={8}>8 Digits (00000001)</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                            {seq.current_val}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-blue-700 text-xs">
                            {seq.prefix}-{String(seq.current_val + 1).padStart(seq.padding, '0')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleSaveSequenceItem(seq)}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded transition"
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. DYNAMIC LOYALTY EARNING & REDEMPTION RULES TAB */}
            {activeTab === 'loyalty' && (
              <div className="space-y-6">
                <div className="border-b pb-3">
                  <h2 className="text-lg font-bold text-slate-900">Loyalty Program & Point Rules Engine</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage bill range earning rules and redemption rules stored directly in database</p>
                </div>

                <div className="flex items-center space-x-3 bg-purple-50 p-4 rounded-xl border border-purple-200">
                  <input
                    type="checkbox"
                    id="loyalty_enable"
                    checked={settings.loyalty.enabled}
                    onChange={(e) => setSettings({ ...settings, loyalty: { ...settings.loyalty, enabled: e.target.checked } })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <label htmlFor="loyalty_enable" className="text-sm font-bold text-purple-900">
                    Enable Customer Loyalty Program System
                  </label>
                </div>

                {/* DYNAMIC LOYALTY REDEMPTION RULES TABLE */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <Gift size={16} className="text-purple-600" />
                        <span>Loyalty Point Redemption Rules</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">Super Admin can configure points-to-discount rules stored in database</p>
                    </div>
                    <button
                      onClick={handleOpenAddRedemptionRule}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow transition flex items-center space-x-1"
                    >
                      <Plus size={14} />
                      <span>+ Add Redemption Rule</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 uppercase text-xs font-bold border-b">
                          <th className="py-2.5 px-4">Points Required</th>
                          <th className="py-2.5 px-4 text-right">Discount Amount (₹)</th>
                          <th className="py-2.5 px-4 text-center">Rule Format</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-center w-28">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {redemptionRules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">No redemption rules configured yet.</td>
                          </tr>
                        ) : (
                          redemptionRules.map((rRule) => (
                            <tr key={rRule.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-mono font-extrabold text-slate-900">
                                {rRule.points_required} Points
                              </td>
                              <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                                ₹{Number(rRule.discount_amount).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-xs font-bold text-purple-700">
                                {rRule.points_required} Points = ₹{rRule.discount_amount} Discount
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button onClick={() => handleToggleRedemptionRule(rRule)}>
                                  {rRule.enabled ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Active</span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">Inactive</span>
                                  )}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  <button onClick={() => handleOpenEditRedemptionRule(rRule)} className="p-1 text-slate-500 hover:text-blue-600">
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => handleDeleteRedemptionRule(rRule.id)} className="p-1 text-slate-500 hover:text-rose-600">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* EARNING RULES TABLE */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Loyalty Earning Rules</h3>
                      <p className="text-[11px] text-slate-500">Configure how many points customers earn based on bill amount ranges</p>
                    </div>
                    <button
                      onClick={handleOpenAddRule}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition flex items-center space-x-1"
                    >
                      <Plus size={14} />
                      <span>+ Add Earning Rule</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 uppercase text-xs font-bold border-b">
                          <th className="py-2.5 px-4">Order</th>
                          <th className="py-2.5 px-4">Rule Name</th>
                          <th className="py-2.5 px-4">Bill Amount Range</th>
                          <th className="py-2.5 px-4 text-right">Points Earned</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-center w-28">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loyaltyRules.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">No custom earning rules created yet.</td>
                          </tr>
                        ) : (
                          loyaltyRules.map((rule) => (
                            <tr key={rule.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-bold text-xs text-slate-500">#{rule.sort_order}</td>
                              <td className="py-3 px-4 font-bold text-slate-900">{rule.rule_name}</td>
                              <td className="py-3 px-4 text-xs font-mono text-slate-700">
                                ₹{rule.min_bill_amount} - {rule.max_bill_amount !== null && rule.max_bill_amount !== undefined ? `₹${rule.max_bill_amount}` : 'Above'}
                              </td>
                              <td className="py-3 px-4 text-right font-extrabold text-purple-700">
                                +{rule.points_earned} Pts
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button onClick={() => handleToggleRule(rule)} className="text-slate-600 hover:text-purple-600">
                                  {rule.enabled ? <ToggleRight className="text-purple-600" size={24} /> : <ToggleLeft className="text-slate-400" size={24} />}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  <button onClick={() => handleOpenEditRule(rule)} className="p-1 text-slate-500 hover:text-blue-600">
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => handleDeleteRule(rule.id)} className="p-1 text-slate-500 hover:text-rose-600">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-3 border-t flex justify-end">
                  <button
                    onClick={() => handleSaveSection('loyalty')}
                    disabled={saving}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center space-x-1.5"
                  >
                    <Save size={16} />
                    <span>Save Loyalty Config</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. WHATSAPP TAB */}
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

            {/* 6. SECURITY & SUPER ADMIN PURGE TAB */}
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

            {/* 7. BACKUP & RESTORE TAB */}
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

      {/* ADD / EDIT LOYALTY REDEMPTION RULE MODAL */}
      {showRedemptionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingRedemptionRule ? 'Edit Redemption Rule' : 'Add New Redemption Rule'}
              </h2>
              <button onClick={() => setShowRedemptionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRedemptionSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Points Required *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 10"
                  value={ptsRequiredInput}
                  onChange={(e) => setPtsRequiredInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="0.5"
                  step="0.5"
                  placeholder="e.g. 5"
                  value={discAmountInput}
                  onChange={(e) => setDiscAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-extrabold text-emerald-700"
                />
              </div>

              <div className="bg-purple-50 p-3 rounded-lg text-xs font-mono font-bold text-purple-900">
                Preview: {ptsRequiredInput || 0} Points = ₹{discAmountInput || 0} Discount
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowRedemptionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg shadow disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingRedemptionRule ? 'Update Rule' : 'Add Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT LOYALTY EARNING RULE MODAL */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingRule ? 'Edit Loyalty Earning Rule' : 'Add New Earning Rule'}
              </h2>
              <button onClick={() => setShowRuleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRuleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Earning Rule"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Bill Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={minBill}
                    onChange={(e) => setMinBill(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Bill Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="Leave empty for Above"
                    value={maxBill}
                    onChange={(e) => setMaxBill(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Points Earned *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={pointsEarnedInput}
                  onChange={(e) => setPointsEarnedInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-extrabold text-purple-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Evaluation Priority Order</label>
                <input
                  type="number"
                  min="1"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg shadow disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Add Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
