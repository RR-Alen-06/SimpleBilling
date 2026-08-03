'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Customer, Product, Bill, RoundingMethod, AllSettings, LoyaltyRedemptionRule } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { InvoiceModal } from '@/components/InvoiceModal';
import {
  Receipt,
  UserPlus,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Gift,
  Sparkles,
  Percent,
  Clock
} from 'lucide-react';

interface CartItem {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
}

export default function BillingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [redemptionRules, setRedemptionRules] = useState<LoyaltyRedemptionRule[]>([]);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Custom Xerox Entry
  const [customItemName, setCustomItemName] = useState('A4 B&W Single');
  const [customItemQty, setCustomItemQty] = useState<number | ''>(1);
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>(2.00);

  // Catalog search
  const [productSearch, setProductSearch] = useState('');

  // Discount (Flat vs Percentage) & Rounding
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENTAGE'>('FLAT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [roundingMethod, setRoundingMethod] = useState<RoundingMethod>('None');

  // Split Payment & Advance Amounts
  const [cashPaid, setCashPaid] = useState<number | ''>('');
  const [upiPaid, setUpiPaid] = useState<number | ''>('');
  const [useAdvance, setUseAdvance] = useState<boolean>(false);
  const [advanceUsed, setAdvanceUsed] = useState<number | ''>('');

  // Loyalty Points Engine State
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [estimatedPointsEarned, setEstimatedPointsEarned] = useState<number>(0);

  // Quick Customer Add Modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustMobile, setNewCustMobile] = useState('');

  // Feedback & Modal state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedBill, setSavedBill] = useState<Bill | null>(null);

  // Customer Ledger Summary State
  const [customerLedgerData, setCustomerLedgerData] = useState<{ runningBalance: number; pendingPoints: number } | null>(null);

  useEffect(() => {
    let active = true;
    if (selectedCustomerId) {
      ApiService.getCustomerLedger(selectedCustomerId).then(res => {
        if (active) setCustomerLedgerData({ runningBalance: res.runningBalance, pendingPoints: res.pendingPoints });
      }).catch(() => {
        if (active) setCustomerLedgerData(null);
      });
    } else {
      Promise.resolve().then(() => {
        if (active) setCustomerLedgerData(null);
      });
    }
    return () => { active = false; };
  }, [selectedCustomerId]);

  const fetchInitialData = async () => {
    try {
      const [custList, prodList, shopSettings, redRules] = await Promise.all([
        ApiService.getCustomers(),
        ApiService.getProducts(),
        ApiService.getSettings(),
        ApiService.getLoyaltyRedemptionRules()
      ]);
      setCustomers(custList);
      setProducts(prodList);
      setSettings(shopSettings);
      setRedemptionRules(redRules);
      setRoundingMethod(shopSettings.billing.rounding_method);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (isMounted) {
        await fetchInitialData();
      }
    };
    void run();
    return () => { isMounted = false; };
  }, []);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Subtotal & Discount Math (Flat vs Percentage)
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);

  const manualDiscountApplied = discountType === 'PERCENTAGE'
    ? Number(((subtotal * (discountValue || 0)) / 100).toFixed(2))
    : Number(discountValue || 0);

  const activeRedemptionRules = redemptionRules.filter(r => r.enabled);
  const loyaltyDiscount = settings
    ? ApiService.calculateLoyaltyDiscount(pointsToRedeem, settings.loyalty, activeRedemptionRules)
    : 0;

  const totalAfterDiscount = Math.max(0, subtotal - manualDiscountApplied - loyaltyDiscount);
  const { roundedTotal, roundingAdjustment } = ApiService.calculateRounding(totalAfterDiscount, roundingMethod);

  // Auto pre-fill full customer advance immediately when selecting a customer with an advance balance
  useEffect(() => {
    let active = true;
    if (selectedCustomerId) {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (cust && cust.advance_balance > 0) {
        Promise.resolve().then(() => {
          if (active) {
            setUseAdvance(true);
            const maxUsable = roundedTotal > 0 ? Math.min(cust.advance_balance, roundedTotal) : cust.advance_balance;
            setAdvanceUsed(maxUsable);
          }
        });
      } else {
        Promise.resolve().then(() => {
          if (active) {
            setUseAdvance(false);
            setAdvanceUsed('');
          }
        });
      }
    } else {
      Promise.resolve().then(() => {
        if (active) {
          setUseAdvance(false);
          setAdvanceUsed('');
        }
      });
    }
    return () => { active = false; };
  }, [selectedCustomerId, customers, roundedTotal]);

  useEffect(() => {
    let active = true;
    if (roundedTotal > 0 && settings?.loyalty.enabled) {
      ApiService.calculateLoyaltyPointsEarned(roundedTotal).then(pts => {
        if (active) setEstimatedPointsEarned(pts);
      });
    } else {
      Promise.resolve(0).then(pts => {
        if (active) setEstimatedPointsEarned(pts);
      });
    }
    return () => { active = false; };
  }, [roundedTotal, settings]);

  const cashVal = Number(cashPaid || 0);
  const upiVal = Number(upiPaid || 0);
  const advanceVal = Number(advanceUsed || 0);

  const directPaidNow = cashVal + upiVal;
  const totalPaidNow = directPaidNow + advanceVal;
  const remainingBillBalance = Math.max(0, roundedTotal - totalPaidNow);

  const prevOutstanding = customerLedgerData?.runningBalance || 0;
  const netDueForCurrentBill = Math.max(0, roundedTotal - advanceVal);
  const overpaymentBeyondCurrentBill = Math.max(0, directPaidNow - netDueForCurrentBill);
  const allocatedToPriorBalance = Math.min(prevOutstanding, overpaymentBeyondCurrentBill);
  const customerAdvanceEarned = overpaymentBeyondCurrentBill - allocatedToPriorBalance;

  const priorPendingPoints = customerLedgerData?.pendingPoints || 0;
  const currentBillPendingPoints = (remainingBillBalance > 0 && estimatedPointsEarned > 0) ? estimatedPointsEarned : 0;
  const totalPendingPoints = priorPendingPoints + currentBillPendingPoints;

  // Add catalog product
  const handleAddProductToCart = (product: Product) => {
    const existingIdx = cart.findIndex(c => c.product_id === product.id);
    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      updated[existingIdx].total = updated[existingIdx].quantity * updated[existingIdx].price;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          price: product.price,
          total: product.price
        }
      ]);
    }
  };

  // Add custom item (e.g., Xerox Xerox pages)
  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemName.trim() || Number(customItemQty) <= 0 || Number(customItemPrice) < 0) return;

    const qty = Number(customItemQty);
    const price = Number(customItemPrice);
    setCart([
      ...cart,
      {
        product_name: customItemName.trim(),
        quantity: qty,
        price,
        total: qty * price
      }
    ]);
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const updated = [...cart];
    updated[index].quantity = newQty;
    updated[index].total = newQty * updated[index].price;
    setCart(updated);
  };

  // Live Editable Rate Handler
  const handleUpdateItemRate = (index: number, newPrice: number) => {
    const updated = [...cart];
    const price = Math.max(0, newPrice);
    updated[index].price = price;
    updated[index].total = updated[index].quantity * price;
    setCart(updated);
  };

  const handleRemoveItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // Quick customer creation
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      const created = await ApiService.addCustomer({
        name: newCustName.trim(),
        mobile: newCustMobile.trim() || undefined
      });
      setCustomers([...customers, created]);
      setSelectedCustomerId(created.id);
      setShowAddCustomerModal(false);
      setNewCustName('');
      setNewCustMobile('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add customer');
    }
  };

  // Quick Pay Handlers
  const handleQuickPayCash = () => {
    setCashPaid(roundedTotal);
    setUpiPaid('');
  };

  const handleQuickPayUPI = () => {
    setUpiPaid(roundedTotal);
    setCashPaid('');
  };

  // Submit & Create Bill
  const handleCreateBill = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (cart.length === 0) {
      setErrorMsg('Please add at least one item to the bill cart.');
      return;
    }

    if (!selectedCustomerId) {
      setErrorMsg('Please select a customer or add a new customer before generating the bill.');
      return;
    }

    if (selectedCustomer && pointsToRedeem > selectedCustomer.loyalty_points) {
      setErrorMsg(`Customer only has ${selectedCustomer.loyalty_points} loyalty points available.`);
      return;
    }

    const effectiveAdvanceVal = useAdvance ? Number(advanceUsed || 0) : 0;

    if (useAdvance && effectiveAdvanceVal > 0) {
      if (effectiveAdvanceVal > (selectedCustomer?.advance_balance || 0)) {
        setErrorMsg(`Advance amount cannot exceed the customer's available advance balance (₹${(selectedCustomer?.advance_balance || 0).toFixed(2)}).`);
        return;
      }

      if (effectiveAdvanceVal > roundedTotal) {
        setErrorMsg(`Advance amount cannot exceed the current bill amount (₹${roundedTotal.toFixed(2)}).`);
        return;
      }
    }

    setSaving(true);
    try {
      const createdBill = await ApiService.createBill({
        customer_id: selectedCustomerId || null,
        total: subtotal,
        discount: manualDiscountApplied,
        rounding_method: roundingMethod,
        cash_paid: cashVal,
        upi_paid: upiVal,
        advance_used: effectiveAdvanceVal,
        points_to_redeem: pointsToRedeem,
        items: cart
      });

      const financialSummary = await ApiService.getBillFinancialSummary(createdBill);
      const billWithSummary = { ...createdBill, financial_summary: financialSummary };

      setSavedBill(billWithSummary);
      setSuccessMsg(`Bill #${createdBill.bill_number} generated successfully!`);

      // Reset form
      setCart([]);
      setDiscountValue(0);
      setCashPaid('');
      setUpiPaid('');
      setUseAdvance(false);
      setAdvanceUsed('');
      setPointsToRedeem(0);
      setSelectedCustomerId('');

      await fetchInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate bill');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <SupabaseBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <Receipt className="text-blue-600" size={26} />
            <span>POS Billing & Flexible Discounts</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Editable item rates, flat/percentage discounts & dynamic loyalty point redemptions</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: CUSTOMER & PRODUCT SELECTOR (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Customer Selection */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select Customer Account *
            </label>
            <div className="flex gap-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setPointsToRedeem(0);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">-- Select Customer * --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.mobile ? `(${c.mobile})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg border border-slate-300 transition flex items-center space-x-1 flex-shrink-0 text-xs font-semibold"
              >
                <UserPlus size={16} />
                <span>+ New</span>
              </button>
            </div>

            {/* Customer Info Card & Customer Advance Controls if selected */}
            {selectedCustomer && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2 shadow-sm">
                  <div className="flex justify-between items-center border-b pb-1.5 font-bold text-slate-800">
                    <span>Customer Ledger & Balance</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold uppercase">Live DB Record</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Previous Outstanding:</span>
                      <span className="font-bold text-amber-700">
                        ₹{(customerLedgerData?.runningBalance || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Available Advance:</span>
                      <span className="font-bold text-emerald-700">₹{selectedCustomer.advance_balance.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Loyalty Balance:</span>
                      <span className="font-bold text-purple-700">⭐ {selectedCustomer.loyalty_points} Pts</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Est. Total Amount Due:</span>
                      <span className="font-extrabold text-blue-700">
                        ₹{((customerLedgerData?.runningBalance || 0) + roundedTotal).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CUSTOMER ADVANCE CONTROL BOX */}
                <div className={`p-3.5 rounded-lg border text-xs space-y-2.5 transition shadow-sm ${selectedCustomer.advance_balance > 0 ? 'bg-blue-50/90 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useAdvance}
                        disabled={selectedCustomer.advance_balance <= 0}
                        onChange={(e) => {
                          setUseAdvance(e.target.checked);
                          if (!e.target.checked) {
                            setAdvanceUsed('');
                          } else {
                            const maxUsable = Math.min(selectedCustomer.advance_balance, roundedTotal);
                            setAdvanceUsed(maxUsable > 0 ? maxUsable : '');
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Use Customer Advance</span>
                    </label>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Available: <strong className="text-emerald-700 font-mono">₹{selectedCustomer.advance_balance.toFixed(2)}</strong>
                    </span>
                  </div>

                  {useAdvance && (
                    <div className="space-y-2 pt-2 border-t border-blue-200/80">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-slate-700">Advance Amount to Apply (₹):</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          max={Math.min(selectedCustomer.advance_balance, roundedTotal)}
                          placeholder="0.00"
                          value={advanceUsed}
                          onChange={(e) => setAdvanceUsed(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                          className="w-28 text-right bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 shadow-inner"
                        />
                      </div>

                      {/* Live Remaining Advance Feedback */}
                      <div className="flex justify-between items-center text-[11px] text-slate-600 font-medium">
                        <span>Remaining Advance Balance:</span>
                        <span className="font-extrabold text-blue-700 font-data-mono">
                          ₹{Math.max(0, selectedCustomer.advance_balance - Number(advanceUsed || 0)).toFixed(2)}
                        </span>
                      </div>

                      {/* Real-time Validation Errors */}
                      {Number(advanceUsed || 0) > selectedCustomer.advance_balance && (
                        <p className="text-[10px] font-bold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          ⚠️ Advance amount cannot exceed the customer&apos;s available advance balance (₹{selectedCustomer.advance_balance.toFixed(2)}).
                        </p>
                      )}
                      {Number(advanceUsed || 0) > roundedTotal && Number(advanceUsed || 0) <= selectedCustomer.advance_balance && (
                        <p className="text-[10px] font-bold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          ⚠️ Advance amount cannot exceed the current bill amount (₹{roundedTotal.toFixed(2)}).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Catalog Products */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Shop Product Catalog
              </label>
              <span className="text-xs text-slate-400">{products.length} items</span>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search products or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-400 p-2 text-center">No products found.</p>
              ) : (
                filteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddProductToCart(prod)}
                    className="flex items-center justify-between p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition border border-transparent hover:border-blue-100"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{prod.name}</p>
                      <p className="text-[10px] text-slate-400">{prod.category}</p>
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      + ₹{prod.price}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Custom Entry */}
          <form onSubmit={handleAddCustomItem} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Quick Custom Entry (Xerox / Printing)
              </label>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                Fast Add
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  placeholder="Item Name (e.g. A4 Color Copy)"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={customItemQty}
                  onChange={(e) => setCustomItemQty(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-center font-data-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block">Unit Rate (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customItemPrice}
                  onChange={(e) => setCustomItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-center font-data-mono font-bold"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-1.5 rounded transition flex items-center justify-center space-x-1"
                >
                  <Plus size={14} />
                  <span>Add Item</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: BILL CART & TOTALS & SPLIT PAYMENTS (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h2 className="font-bold text-slate-900 text-base">Current Bill Items</h2>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                {cart.length} items
              </span>
            </div>

            {/* CART ITEMS TABLE WITH EDITABLE UNIT RATE */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No items added to bill yet. Click products from catalog or use quick custom entry.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {cart.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{item.product_name}</p>

                      {/* EDITABLE UNIT RATE INPUT */}
                      <div className="flex items-center space-x-1 text-[10px] text-slate-500 mt-0.5">
                        <span>Rate: ₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.price}
                          onChange={(e) => handleUpdateItemRate(idx, Number(e.target.value))}
                          className="w-16 bg-slate-50 border border-slate-300 rounded px-1 py-0.5 text-[10px] font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                        className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                        className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold"
                      >
                        +
                      </button>
                    </div>

                    <span className="w-16 text-right font-extrabold text-slate-900">
                      ₹{item.total.toFixed(2)}
                    </span>

                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOTALS & DISCOUNTS & ROUNDING */}
          <div className="border-t border-slate-200 pt-4 space-y-3 bg-slate-50 p-4 rounded-xl">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-bold text-slate-900">₹{subtotal.toFixed(2)}</span>
            </div>

            {/* DISCOUNT TYPE SELECTOR (FLAT ₹ vs PERCENTAGE %) */}
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-600 font-medium">Discount:</span>
                <div className="bg-white border border-slate-300 rounded p-0.5 flex">
                  <button
                    type="button"
                    onClick={() => setDiscountType('FLAT')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${discountType === 'FLAT' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    Flat ₹
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('PERCENTAGE')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center space-x-0.5 ${discountType === 'PERCENTAGE' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <span>Percent</span>
                    <Percent size={10} />
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="0"
                  step="any"
                  max={discountType === 'PERCENTAGE' ? 100 : undefined}
                  placeholder="0"
                  value={discountValue === 0 ? '' : discountValue}
                  onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                  className="w-24 text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-500 w-4">
                  {discountType === 'FLAT' ? '₹' : '%'}
                </span>
              </div>
            </div>

            {/* Calculated Discount Feedback */}
            {discountType === 'PERCENTAGE' && discountValue > 0 && (
              <div className="flex justify-between text-xs text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded">
                <span>Calculated {discountValue}% Discount:</span>
                <span>-₹{manualDiscountApplied.toFixed(2)}</span>
              </div>
            )}

            {/* Dynamic Active Redemption Rules Selector & Points Input */}
            {selectedCustomer && selectedCustomer.loyalty_points > 0 && settings?.loyalty.enabled && (
              <div className="space-y-2 bg-purple-50 p-3 rounded-lg border border-purple-200">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-900 font-bold flex items-center space-x-1">
                    <Gift size={14} />
                    <span>Redeem Loyalty Points:</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={selectedCustomer.loyalty_points}
                    value={pointsToRedeem === 0 ? '' : pointsToRedeem}
                    onChange={(e) => {
                      const inputPts = Math.max(0, Number(e.target.value));
                      setPointsToRedeem(Math.min(selectedCustomer.loyalty_points, inputPts));
                    }}
                    className="w-20 text-right bg-white border border-purple-300 rounded px-2 py-1 text-xs font-extrabold text-purple-900 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* Quick Active Redemption Rules Buttons */}
                {activeRedemptionRules.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeRedemptionRules.map((rRule) => (
                      <button
                        key={rRule.id}
                        type="button"
                        onClick={() => {
                          if (selectedCustomer.loyalty_points >= rRule.points_required) {
                            setPointsToRedeem(rRule.points_required);
                          }
                        }}
                        disabled={selectedCustomer.loyalty_points < rRule.points_required}
                        className={`text-[10px] px-2 py-1 rounded font-bold transition border ${pointsToRedeem === rRule.points_required
                            ? 'bg-purple-700 text-white border-purple-800'
                            : selectedCustomer.loyalty_points >= rRule.points_required
                              ? 'bg-white text-purple-800 border-purple-300 hover:bg-purple-100'
                              : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          }`}
                      >
                        {rRule.points_required} Pts = ₹{rRule.discount_amount}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* REAL-TIME LOYALTY LIVE DISPLAY WIDGET */}
            {selectedCustomer && settings?.loyalty.enabled && (
              <div className="bg-purple-900 text-white p-3.5 rounded-lg text-xs space-y-2 shadow">
                <div className="flex justify-between items-center border-b border-purple-800 pb-1.5 font-bold">
                  <span className="flex items-center space-x-1 text-purple-200">
                    <Sparkles size={14} />
                    <span>Loyalty Engine</span>
                  </span>
                  <span className={`font-mono font-bold ${remainingBillBalance === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {remainingBillBalance === 0
                      ? `🎁 +${estimatedPointsEarned} pts Earned`
                      : `⏳ +${estimatedPointsEarned} pts On Full Pay`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-purple-300 block">Current Loyalty Points:</span>
                    <span className="font-extrabold">{selectedCustomer.loyalty_points} Points</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Discount Applied:</span>
                    <span className="font-extrabold text-emerald-300">-₹{loyaltyDiscount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Points Redeemed:</span>
                    <span className="font-extrabold">{pointsToRedeem} Points</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Estimated Balance:</span>
                    <span className="font-extrabold text-purple-200">
                      {Math.max(0, selectedCustomer.loyalty_points - pointsToRedeem + (remainingBillBalance === 0 ? estimatedPointsEarned : 0))} Points
                    </span>
                  </div>
                  <div className="col-span-2 pt-1.5 border-t border-purple-800/80 flex justify-between items-center">
                    <span className="text-purple-300 font-semibold flex items-center space-x-1">
                      <Clock size={12} className="text-amber-400" />
                      <span>Pending Uncredited Points:</span>
                    </span>
                    <span className="font-extrabold text-amber-300 font-mono">
                      ⏳ {totalPendingPoints} Points
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Rounding Selection */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 flex items-center space-x-1">
                <Calculator size={14} />
                <span>Rounding Method:</span>
              </span>
              <select
                value={roundingMethod}
                onChange={(e) => setRoundingMethod(e.target.value as RoundingMethod)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800"
              >
                <option value="None">No Rounding</option>
                <option value="Round Down">Round Down</option>
                <option value="Round Up">Round Up</option>
                <option value="Standard">Standard Rounding</option>
              </select>
            </div>

            {roundingAdjustment !== 0 && (
              <div className="flex justify-between text-xs text-slate-500 italic">
                <span>Rounding Adjustment:</span>
                <span>{roundingAdjustment >= 0 ? '+' : ''}₹{roundingAdjustment.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-lg font-extrabold text-slate-900 pt-2 border-t border-slate-200">
              <span>Grand Total:</span>
              <span className="text-blue-700 text-xl">₹{roundedTotal.toFixed(2)}</span>
            </div>

            {/* SPLIT PAYMENT INPUTS */}
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Payment Method & Breakdown
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickPayCash}
                    className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded transition"
                  >
                    ⚡ Cash
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickPayUPI}
                    className="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded transition"
                  >
                    ⚡ UPI
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">Cash (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={cashPaid}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setCashPaid(val);
                      if (val !== '' && Number(val) > 0 && upiVal === roundedTotal) setUpiPaid('');
                    }}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">UPI (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={upiPaid}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setUpiPaid(val);
                      if (val !== '' && Number(val) > 0 && cashVal === roundedTotal) setCashPaid('');
                    }}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">Advance Applied (₹)</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!useAdvance || !selectedCustomer || selectedCustomer.advance_balance <= 0}
                    placeholder="0"
                    value={useAdvance ? advanceUsed : ''}
                    onChange={(e) => setAdvanceUsed(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Payment Math Feedback */}
              <div className="flex flex-col space-y-1 text-xs pt-1 font-semibold border-t border-slate-100 mt-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Paid Now: <strong className="text-slate-900 font-data-mono">₹{totalPaidNow.toFixed(2)}</strong></span>
                  {remainingBillBalance > 0 ? (
                    <span className="text-rose-600 font-bold">Current Bill Due: ₹{remainingBillBalance.toFixed(2)}</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">Bill Paid Full ✓</span>
                  )}
                </div>
                {allocatedToPriorBalance > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-amber-700 font-bold">
                    <span>Allocated to Prev. Due:</span>
                    <span className="font-data-mono">₹{allocatedToPriorBalance.toFixed(2)}</span>
                  </div>
                )}
                {customerAdvanceEarned > 0 && (
                  <div className="flex justify-between items-center text-[11px] text-blue-700 font-bold">
                    <span>Saved to Advance:</span>
                    <span className="font-data-mono">₹{customerAdvanceEarned.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ACTION BUTTON */}
            <div className="pt-2">
              <button
                onClick={handleCreateBill}
                disabled={saving || cart.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm py-3 rounded-lg shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Receipt size={18} />
                <span>{saving ? 'Generating Bill...' : 'Generate Bill & Receipt'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK ADD CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Quick Add New Customer</h3>
            <form onSubmit={handleAddCustomerSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number (Optional)</label>
                <input
                  type="text"
                  value={newCustMobile}
                  onChange={(e) => setNewCustMobile(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded shadow"
                >
                  Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE MODAL */}
      {savedBill && (
        <InvoiceModal bill={savedBill} onClose={() => setSavedBill(null)} />
      )}
    </div>
  );
}
