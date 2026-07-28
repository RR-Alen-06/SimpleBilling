'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Customer, Product, Bill, RoundingMethod, AllSettings } from '@/lib/types';
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
  Sparkles
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

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Custom Xerox Entry
  const [customItemName, setCustomItemName] = useState('A4 B&W Single');
  const [customItemQty, setCustomItemQty] = useState<number | ''>(1);
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>(2.00);

  // Catalog search
  const [productSearch, setProductSearch] = useState('');

  // Discount & Rounding
  const [discount, setDiscount] = useState<number>(0);
  const [roundingMethod, setRoundingMethod] = useState<RoundingMethod>('None');

  // Split Payment Amounts
  const [cashPaid, setCashPaid] = useState<number | ''>('');
  const [upiPaid, setUpiPaid] = useState<number | ''>('');
  const [cardPaid, setCardPaid] = useState<number | ''>('');
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

  const fetchInitialData = async () => {
    try {
      const [custList, prodList, shopSettings] = await Promise.all([
        ApiService.getCustomers(),
        ApiService.getProducts(),
        ApiService.getSettings()
      ]);
      setCustomers(custList);
      setProducts(prodList);
      setSettings(shopSettings);
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

  // Dynamic Earning Recalculation
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const loyaltyDiscount = (pointsToRedeem * (settings?.loyalty.amount_per_point || 1));
  const totalAfterDiscount = Math.max(0, subtotal - Number(discount || 0) - loyaltyDiscount);
  const { roundedTotal, roundingAdjustment } = ApiService.calculateRounding(totalAfterDiscount, roundingMethod);

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
  const cardVal = Number(cardPaid || 0);
  const advanceVal = Number(advanceUsed || 0);

  const totalPaidNow = cashVal + upiVal + cardVal + advanceVal;
  const remainingBalance = Math.max(0, roundedTotal - totalPaidNow);
  const customerAdvanceEarned = totalPaidNow > roundedTotal ? totalPaidNow - roundedTotal : 0;

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

  // Quick Pay Full in Cash
  const handleQuickPayCash = () => {
    setCashPaid(roundedTotal);
    setUpiPaid('');
    setCardPaid('');
  };

  // Submit & Create Bill
  const handleCreateBill = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (cart.length === 0) {
      setErrorMsg('Please add at least one item to the bill cart.');
      return;
    }

    if (advanceVal > (selectedCustomer?.advance_balance || 0)) {
      setErrorMsg(`Customer only has ₹${(selectedCustomer?.advance_balance || 0).toFixed(2)} advance balance available.`);
      return;
    }

    // Dynamic Redemption Limits Check
    if (pointsToRedeem > 0) {
      const minPointsReq = settings?.loyalty.min_points_to_redeem || 1;
      const maxPointsLimit = settings?.loyalty.max_points_per_bill || 500;
      const maxDiscountLimit = settings?.loyalty.max_discount_per_bill || 500;

      if (pointsToRedeem < minPointsReq) {
        setErrorMsg(`Minimum ${minPointsReq} loyalty points required for redemption.`);
        return;
      }
      if (pointsToRedeem > maxPointsLimit) {
        setErrorMsg(`Maximum ${maxPointsLimit} loyalty points redeemable per bill.`);
        return;
      }
      if (loyaltyDiscount > maxDiscountLimit) {
        setErrorMsg(`Maximum loyalty discount allowed per bill is ₹${maxDiscountLimit}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const createdBill = await ApiService.createBill({
        customer_id: selectedCustomerId || null,
        total: subtotal,
        discount: Number(discount || 0),
        rounding_method: roundingMethod,
        cash_paid: cashVal,
        upi_paid: upiVal,
        card_paid: cardVal,
        advance_used: advanceVal,
        points_to_redeem: pointsToRedeem,
        items: cart
      });

      setSavedBill(createdBill);
      setSuccessMsg(`Bill #${createdBill.bill_number} generated successfully!`);

      // Reset form
      setCart([]);
      setDiscount(0);
      setCashPaid('');
      setUpiPaid('');
      setCardPaid('');
      setAdvanceUsed('');
      setPointsToRedeem(0);
      setSelectedCustomerId('');

      fetchInitialData();
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
            <span>POS Billing & Loyalty Engine Integration</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Xerox page rates, stationery catalog, multi-mode split payments & dynamic loyalty rules</p>
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
              Select Customer Account (Optional)
            </label>
            <div className="flex gap-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Walk-in Customer</option>
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

            {/* Customer Info Card if selected */}
            {selectedCustomer && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Advance Balance:</span>
                  <span className="font-bold text-emerald-700">₹{selectedCustomer.advance_balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Loyalty Points:</span>
                  <span className="font-bold text-purple-700">⭐ {selectedCustomer.loyalty_points} Points</span>
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

          {/* Quick Xerox Entry */}
          <form onSubmit={handleAddCustomItem} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quick Custom Entry (Xerox / Printing)
            </label>
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
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block">Unit Rate (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={customItemPrice}
                  onChange={(e) => setCustomItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-center font-bold"
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

            {/* CART ITEMS TABLE */}
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
                      <p className="text-[10px] text-slate-400">Rate: ₹{item.price.toFixed(2)}</p>
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

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600">Discount (₹):</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={discount === 0 ? '' : discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Loyalty Points Redemption Input */}
            {selectedCustomer && selectedCustomer.loyalty_points > 0 && settings?.loyalty.enabled && (
              <div className="flex justify-between items-center text-xs bg-purple-50 p-2 rounded border border-purple-200">
                <span className="text-purple-800 font-bold flex items-center space-x-1">
                  <Gift size={14} />
                  <span>Redeem Points (Max: {selectedCustomer.loyalty_points} pts):</span>
                </span>
                <input
                  type="number"
                  min="0"
                  max={selectedCustomer.loyalty_points}
                  value={pointsToRedeem === 0 ? '' : pointsToRedeem}
                  onChange={(e) => setPointsToRedeem(Math.min(selectedCustomer.loyalty_points, Math.max(0, Number(e.target.value))))}
                  className="w-20 text-right bg-white border border-purple-300 rounded px-2 py-1 text-xs font-bold text-purple-900 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            )}

            {/* REAL-TIME LOYALTY LIVE DISPLAY WIDGET */}
            {selectedCustomer && settings?.loyalty.enabled && (
              <div className="bg-purple-900 text-white p-3.5 rounded-lg text-xs space-y-1.5 shadow">
                <div className="flex justify-between items-center border-b border-purple-800 pb-1.5 font-bold">
                  <span className="flex items-center space-x-1 text-purple-200">
                    <Sparkles size={14} />
                    <span>Loyalty Engine Calculation</span>
                  </span>
                  <span className="text-emerald-400 font-mono">
                    +{estimatedPointsEarned} pts Earned
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-purple-300 block">Current Balance:</span>
                    <span className="font-extrabold">{selectedCustomer.loyalty_points} Points</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Redeem Discount:</span>
                    <span className="font-extrabold text-emerald-300">-₹{loyaltyDiscount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Redeemed Points:</span>
                    <span className="font-extrabold">{pointsToRedeem} Points</span>
                  </div>
                  <div>
                    <span className="text-purple-300 block">Net Balance After Bill:</span>
                    <span className="font-extrabold text-purple-200">
                      {Math.max(0, selectedCustomer.loyalty_points - pointsToRedeem + estimatedPointsEarned)} Points
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
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Split Payment Breakdown
                </label>
                <button
                  type="button"
                  onClick={handleQuickPayCash}
                  className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded"
                >
                  ⚡ Pay Full Cash
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">Cash (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={cashPaid}
                    onChange={(e) => setCashPaid(e.target.value === '' ? '' : Number(e.target.value))}
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
                    onChange={(e) => setUpiPaid(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">Card (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={cardPaid}
                    onChange={(e) => setCardPaid(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold">Advance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!selectedCustomer || selectedCustomer.advance_balance <= 0}
                    placeholder="0"
                    value={advanceUsed}
                    onChange={(e) => setAdvanceUsed(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Payment Math Feedback */}
              <div className="flex justify-between items-center text-xs pt-1 font-semibold">
                <span className="text-slate-500">Paid Now: ₹{totalPaidNow.toFixed(2)}</span>
                {remainingBalance > 0 ? (
                  <span className="text-rose-600">Balance Due: ₹{remainingBalance.toFixed(2)}</span>
                ) : customerAdvanceEarned > 0 ? (
                  <span className="text-blue-600">Saved to Advance: ₹{customerAdvanceEarned.toFixed(2)}</span>
                ) : (
                  <span className="text-emerald-600">Paid Full ✓</span>
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
