'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { Customer, Product, Bill, PaymentMethod } from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { InvoiceModal } from '@/components/InvoiceModal';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  UserPlus, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Save, 
  IndianRupee,
  Search
} from 'lucide-react';

interface CartItem {
  product_id?: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
}

export default function BillingPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Custom manual item entry fields
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [customItemQty, setCustomItemQty] = useState<number | ''>(1);
  const [productSearch, setProductSearch] = useState('');

  // Bill totals
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');

  // Quick Customer Add Modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustMobile, setNewCustMobile] = useState('');

  // Feedback & Modal state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedBill, setSavedBill] = useState<Bill | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [custList, prodList] = await Promise.all([
        ApiService.getCustomers(),
        ApiService.getProducts()
      ]);
      setCustomers(custList);
      setProducts(prodList);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const grandTotal = Math.max(0, subtotal - Number(discount || 0));

  // Add selected existing product to cart
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

  // Add custom item (e.g. Xerox 45 copies)
  const handleAddCustomItem = () => {
    setErrorMsg('');
    if (!customItemName.trim()) {
      setErrorMsg('Please enter product or service name.');
      return;
    }
    const priceNum = Number(customItemPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMsg('Price cannot be negative.');
      return;
    }
    const qtyNum = Number(customItemQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setErrorMsg('Quantity must be greater than 0.');
      return;
    }

    setCart([
      ...cart,
      {
        product_name: customItemName.trim(),
        quantity: qtyNum,
        price: priceNum,
        total: priceNum * qtyNum
      }
    ]);

    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty(1);
  };

  // Update Item in Cart (Editable price & qty)
  const handleUpdateCartItem = (index: number, field: 'quantity' | 'price', value: number) => {
    const updated = [...cart];
    const item = { ...updated[index] };

    if (field === 'quantity') {
      item.quantity = Math.max(0.01, value);
    } else if (field === 'price') {
      item.price = Math.max(0, value);
    }
    item.total = item.quantity * item.price;
    updated[index] = item;
    setCart(updated);
  };

  // Remove Item
  const handleRemoveCartItem = (index: number) => {
    setCart(cart.filter((_, idx) => idx !== index));
  };

  // Quick Customer Creation
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
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

  // Save Bill
  const handleSaveBill = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (cart.length === 0) {
      setErrorMsg('Cannot create empty bill. Add at least one item.');
      return;
    }

    for (const item of cart) {
      if (item.quantity <= 0) {
        setErrorMsg(`Item "${item.product_name}" quantity must be greater than 0.`);
        return;
      }
      if (item.price < 0) {
        setErrorMsg(`Item "${item.product_name}" price cannot be negative.`);
        return;
      }
    }

    const paid = paidAmount === '' ? grandTotal : Number(paidAmount);
    if (paid < 0) {
      setErrorMsg('Payment amount cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const created = await ApiService.createBill({
        customer_id: selectedCustomerId || null,
        total: subtotal,
        discount: Number(discount || 0),
        grand_total: grandTotal,
        paid_amount: paid,
        payment_method: paymentMethod,
        items: cart
      });

      const fullBill = await ApiService.getBillById(created.id);
      setSavedBill(fullBill || created);
      setSuccessMsg('Bill generated successfully!');

      // Reset form
      setCart([]);
      setDiscount(0);
      setPaidAmount('');
      setSelectedCustomerId('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save bill');
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
            <span>Create New Bill</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Quick POS billing for Xerox, Prints & Stationery</p>
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
        {/* LEFT COLUMN: PRODUCT SEARCH & QUICK ADD (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Customer Selection */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Select Customer (Optional)
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
                title="Add New Customer"
              >
                <UserPlus size={16} />
                <span>+ New</span>
              </button>
            </div>
          </div>

          {/* Catalog Products */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Shop Product
              </label>
              <span className="text-xs text-slate-400">{products.length} items available</span>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search product name or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No products found in shop catalog.</p>
              ) : (
                filteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddProductToCart(prod)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition group"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{prod.name}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{prod.category}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900">₹{prod.price}</span>
                      <span className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700 transition">
                        <Plus size={14} />
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Custom Item Entry (e.g., Special Xerox Page Count) */}
          <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Add Custom Service / Xerox Item
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Item Name (e.g. A4 Color Xerox 50 pgs)"
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0.00"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={customItemQty}
                    onChange={(e) => setCustomItemQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddCustomItem}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded transition flex items-center justify-center space-x-1 mt-1"
              >
                <Plus size={14} />
                <span>Add Custom Item</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: BILL CART & TOTALS (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-bold text-slate-800 text-lg">Bill Items List</h2>
              <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-semibold">
                {cart.length} items
              </span>
            </div>

            {/* CART TABLE */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Receipt className="mx-auto text-slate-300 mb-2" size={36} />
                <p className="text-sm font-medium text-slate-600">Bill cart is empty</p>
                <p className="text-xs text-slate-400 mt-1">Select catalog items or add a custom Xerox job to start billing.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-2 text-center w-24">Qty</th>
                      <th className="py-2.5 px-2 text-right w-24">Price (₹)</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      <th className="py-2.5 px-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium text-slate-800">{item.product_name}</td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0.1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateCartItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full text-center bg-slate-50 border border-slate-300 rounded px-1 py-1 font-semibold text-xs focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={item.price}
                            onChange={(e) => handleUpdateCartItem(idx, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full text-right bg-slate-50 border border-slate-300 rounded px-1 py-1 font-semibold text-xs focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          ₹{item.total.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleRemoveCartItem(idx)}
                            className="text-slate-400 hover:text-rose-600 transition"
                            title="Remove Item"
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

            {/* BILL SUMMARY & PAYMENT MODE */}
            <div className="pt-4 border-t border-slate-200 space-y-3 bg-slate-50 p-4 rounded-lg">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-900">₹{subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-28 text-right bg-white border border-slate-300 rounded px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-between items-center text-lg font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Total:</span>
                <span className="text-blue-700 text-xl">₹{grandTotal.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-slate-300 text-xs font-semibold">
                    {(['Cash', 'UPI', 'Card'] as PaymentMethod[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMethod(mode)}
                        className={`py-1.5 rounded text-center transition ${
                          paymentMethod === mode
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Amount Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={`Full (₹${grandTotal})`}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* SAVE / PRINT BUTTONS */}
              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveBill}
                  disabled={saving || cart.length === 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-lg shadow transition flex items-center justify-center space-x-2"
                >
                  <Save size={18} />
                  <span>{saving ? 'Saving Bill...' : 'Save & Print Bill'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK ADD CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add New Customer</h2>
            <form onSubmit={handleQuickAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Number (Optional)</label>
                <input
                  type="text"
                  value={newCustMobile}
                  onChange={(e) => setNewCustMobile(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 rounded-lg shadow"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE PRINT MODAL */}
      {savedBill && (
        <InvoiceModal bill={savedBill} onClose={() => setSavedBill(null)} />
      )}
    </div>
  );
}
