'use client';

import React, { useState, useEffect } from 'react';
import { ApiService } from '@/lib/services/api';
import { 
  InternalTransfer, 
  AccountingClosing, 
  CurrentSessionStatus, 
  DateFilterOption, 
  AllSettings,
  ExpenseCategory,
  ReconciliationCalculation,
  UnpaidSessionBill,
  Bill
} from '@/lib/types';
import { SupabaseBanner } from '@/components/SupabaseBanner';
import { AccountingStatementGenerator } from '@/lib/services/accountingStatementGenerator';
import { ACCOUNTING_DATE_FILTER_BUTTONS } from '@/lib/constants/filters';
import { downloadCSV } from '@/lib/utils/csv';
import { 
  BookOpen, 
  ArrowRightLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Plus, 
  Printer, 
  Download, 
  Calendar, 
  Wallet, 
  Smartphone, 
  ShieldCheck, 
  Clock, 
  FileSpreadsheet, 
  Search, 
  Edit3, 
  X,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';

interface LedgerRow {
  id: string;
  date: string;
  type: 'BILL' | 'PAYMENT' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  refNumber: string;
  description: string;
  mode: string;
  cashIn: number;
  cashOut: number;
  upiIn: number;
  upiOut: number;
  runningCash?: number;
  runningUpi?: number;
  isDuplicateVoucher?: boolean;
}

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<'daybook' | 'transfers' | 'closings'>('daybook');
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<CurrentSessionStatus | null>(null);
  const [closings, setClosings] = useState<AccountingClosing[]>([]);
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [settings, setSettings] = useState<AllSettings | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('current_session');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('ALL');

  // Record Shop Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseCategory, setExpenseCategory] = useState('Shop Expense');
  const [expensePaymentMode, setExpensePaymentMode] = useState<'Cash' | 'UPI' | 'Split'>('Cash');
  const [expenseCashAmount, setExpenseCashAmount] = useState<number | ''>('');
  const [expenseUpiAmount, setExpenseUpiAmount] = useState<number | ''>('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseCategories, setExpenseCategories] = useState<string[]>([
    'Shop Expense',
    'Raw Materials / Paper',
    'Electricity / Utility',
    'Rent',
    'Maintenance & Repairs',
    'Salaries / Wages',
    'Tea & Refreshments',
    'Printing Ink / Cartridge',
    'Stationery Stock',
    'Other'
  ]);

  // New Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDirection, setTransferDirection] = useState<'CASH_TO_UPI' | 'UPI_TO_CASH'>('CASH_TO_UPI');
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferReason, setTransferReason] = useState('Cash Deposited to Bank');
  const [transferRefNo, setTransferRefNo] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  // Close Session (Reconciliation) Modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [reconcileFromDate, setReconcileFromDate] = useState('');
  const [reconcileToDate, setReconcileToDate] = useState('');
  const [reconcileCalc, setReconcileCalc] = useState<ReconciliationCalculation | null>(null);
  const [actualCash, setActualCash] = useState<number | ''>('');
  const [actualUpi, setActualUpi] = useState<number | ''>('');
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [closeAdminPin, setCloseAdminPin] = useState('');

  // Quick Settle Bill Due Modal (Inside Session Close Wizard)
  const [settlingBill, setSettlingBill] = useState<UnpaidSessionBill | null>(null);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<'Cash' | 'UPI' | 'Advance'>('Cash');
  const [settlingAmount, setSettlingAmount] = useState<number | ''>('');
  const [settlingSubmitting, setSettlingSubmitting] = useState(false);
  const [customReconcileRange, setCustomReconcileRange] = useState(false);

  // Edit / Re-Audit Session Modal
  const [editingClosing, setEditingClosing] = useState<AccountingClosing | null>(null);
  const [editActualCash, setEditActualCash] = useState<number | ''>('');
  const [editActualUpi, setEditActualUpi] = useState<number | ''>('');
  const [editDiscrepancyNote, setEditDiscrepancyNote] = useState('');
  const [editAdminPin, setEditAdminPin] = useState('');

  // Feedback Messages
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        currentStatus,
        closingsData,
        transfersData,
        settingsData,
        billsData,
        paymentsData,
        expensesData
      ] = await Promise.all([
        ApiService.getCurrentSessionStatus(),
        ApiService.getAccountingClosings(),
        ApiService.getInternalTransfers(),
        ApiService.getSettings(),
        ApiService.getBills(),
        ApiService.getPayments(),
        ApiService.getExpenses()
      ]);

      setSessionStatus(currentStatus);
      setClosings(closingsData);
      setTransfers(transfersData);
      setSettings(settingsData);
      if (settingsData?.expenses?.categories && settingsData.expenses.categories.length > 0) {
        setExpenseCategories(settingsData.expenses.categories);
      }

      // Reconstruct Day Book / Ledger Rows
      const rows: LedgerRow[] = [];

      // Active payments represent actual cash & UPI money received
      const activePayments = paymentsData.filter(p => p.status !== 'CANCELLED' && p.status !== 'REVERSED');
      const billsMap = new Map<string, Bill>(billsData.map(b => [b.id, b]));

      // Add Bills:
      // Mark as duplicate voucher if this bill's payment is already represented by a payment voucher in paymentsData,
      // or if it was paid later via account dues payments (so money inflow is already accounted for under PAY-xxxx).
      const paymentBillIds = new Set(activePayments.map(p => p.bill_id).filter(Boolean));
      billsData.forEach(b => {
        const cashAmt = Number(b.cash_paid || 0);
        const upiAmt = Number(b.upi_paid || 0);
        const isHandledByPaymentVoucher = paymentBillIds.has(b.id);

        if (cashAmt > 0 || upiAmt > 0) {
          rows.push({
            id: `bill_${b.id}`,
            date: b.created_at,
            type: 'BILL',
            refNumber: b.bill_number,
            description: `Sales Bill - ${b.customer_name || 'Counter Customer'}`,
            mode: cashAmt > 0 && upiAmt > 0 ? 'Split' : (cashAmt > 0 ? 'Cash' : 'UPI'),
            cashIn: cashAmt,
            cashOut: 0,
            upiIn: upiAmt,
            upiOut: 0,
            isDuplicateVoucher: isHandledByPaymentVoucher
          });
        }
      });

      // Add Customer Payments (each representing an authentic Cash or UPI inflow voucher)
      activePayments.forEach(p => {
        const amt = Number(p.amount || 0);
        const linkedBill = p.bill_id ? billsMap.get(p.bill_id) : null;
        
        let desc = p.notes;
        if (!desc || desc.startsWith('[')) {
          desc = linkedBill 
            ? `Bill Payment (${linkedBill.bill_number}) - ${p.customer_name || 'Customer'}`
            : (p.notes ? `${p.notes} - ${p.customer_name || 'Customer'}` : `Customer Payment - ${p.customer_name || 'Customer'}`);
        } else if (!desc.includes(p.customer_name || '')) {
          desc = `${desc} - ${p.customer_name || 'Customer'}`;
        }

        let payCashIn = p.payment_method === 'Cash' ? amt : 0;
        let payUpiIn = p.payment_method === 'UPI' ? amt : 0;
        if (p.payment_method === 'Split Payment') {
          if (linkedBill && (Number(linkedBill.cash_paid || 0) + Number(linkedBill.upi_paid || 0) > 0)) {
            payCashIn = Number(linkedBill.cash_paid || 0);
            payUpiIn = Number(linkedBill.upi_paid || 0);
          } else {
            payCashIn = amt;
          }
        }

        rows.push({
          id: `pay_${p.id}`,
          date: p.created_at,
          type: 'PAYMENT',
          refNumber: p.payment_number || 'PAY-—',
          description: desc,
          mode: p.payment_method || 'Cash',
          cashIn: payCashIn,
          cashOut: 0,
          upiIn: payUpiIn,
          upiOut: 0,
          isDuplicateVoucher: false
        });
      });

      // Add Expenses
      expensesData.forEach(e => {
        const totalAmt = Number(e.amount || 0);
        let cashAmt = Number(e.cash_amount !== undefined ? e.cash_amount : (e.payment_mode === 'Cash' ? totalAmt : 0));
        const upiAmt = Number(e.upi_amount !== undefined ? e.upi_amount : (e.payment_mode === 'UPI' ? totalAmt : 0));
        
        if (e.payment_mode === 'Split' && cashAmt === 0 && upiAmt === 0) {
          cashAmt = totalAmt;
        }

        rows.push({
          id: `exp_${e.id}`,
          date: e.created_at,
          type: 'EXPENSE',
          refNumber: e.expense_number || 'EXP-—',
          description: `Expense: ${e.title} (${e.category})`,
          mode: e.payment_mode || 'Cash',
          cashIn: 0,
          cashOut: cashAmt,
          upiIn: 0,
          upiOut: upiAmt,
          isDuplicateVoucher: false
        });
      });

      // Add Transfers
      transfersData.forEach(t => {
        const amt = Number(t.amount || 0);
        if (t.direction === 'CASH_TO_UPI') {
          rows.push({
            id: `trans_${t.id}`,
            date: t.created_at,
            type: 'TRANSFER_OUT',
            refNumber: t.transfer_number || 'TRANS-—',
            description: `Transfer: Cash to UPI (${t.reason})`,
            mode: 'Cash -> UPI',
            cashIn: 0,
            cashOut: amt,
            upiIn: amt,
            upiOut: 0,
            isDuplicateVoucher: false
          });
        } else {
          rows.push({
            id: `trans_${t.id}`,
            date: t.created_at,
            type: 'TRANSFER_IN',
            refNumber: t.transfer_number || 'TRANS-—',
            description: `Transfer: UPI to Cash (${t.reason})`,
            mode: 'UPI -> Cash',
            cashIn: amt,
            cashOut: 0,
            upiIn: 0,
            upiOut: amt,
            isDuplicateVoucher: false
          });
        }
      });

      // Sort rows chronologically descending
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Compute running balances chronologically ascending (skipping duplicate vouchers to keep true drawer/bank balances).
      // Prior closed session rows accumulate from 0; active open session rows start cleanly at opening_cash / opening_upi
      // so the active session running balance always matches Cash in Drawer & UPI / Bank Balance 100%.
      const ascending = [...rows].reverse();
      const activeSessionStartMs = new Date(currentStatus.session_start_date).getTime();
      let runningCash = 0;
      let runningUpi = 0;
      let enteredActiveSession = false;

      ascending.forEach(row => {
        const rowMs = new Date(row.date).getTime();
        if (!enteredActiveSession && rowMs > activeSessionStartMs) {
          runningCash = currentStatus.opening_cash;
          runningUpi = currentStatus.opening_upi;
          enteredActiveSession = true;
        }
        if (!row.isDuplicateVoucher) {
          runningCash += row.cashIn - row.cashOut;
          runningUpi += row.upiIn - row.upiOut;
        }
        row.runningCash = Number(runningCash.toFixed(2));
        row.runningUpi = Number(runningUpi.toFixed(2));
      });

      setLedgerRows(rows);
    } catch (err: unknown) {
      console.error('Failed to load accounting data:', err);
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error loading accounting records' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFilter, customFrom, customTo]);

  // Open Close Session Modal
  const handleOpenCloseModal = async () => {
    setCloseAdminPin('');
    setDiscrepancyNote('');
    setFeedback(null);
    setCustomReconcileRange(false);

    const now = new Date();
    const defaultTo = now.toISOString();
    const defaultFrom = sessionStatus?.session_start_date || '2026-01-01T00:00:00.000Z';

    setReconcileFromDate(defaultFrom.slice(0, 10));
    setReconcileToDate(defaultTo.slice(0, 10));

    try {
      const calc = await ApiService.calculateReconciliationForRange(defaultFrom, defaultTo);
      setReconcileCalc(calc);
      setActualCash(calc.expected_cash);
      setActualUpi(calc.expected_upi);
      setShowCloseModal(true);
    } catch (err) {
      console.error('Failed to calculate reconciliation:', err);
    }
  };

  // Re-calculate when closing date range changes
  const handleRecalculateCloseRange = async (from: string, to: string, isCustom = true) => {
    try {
      setCustomReconcileRange(isCustom);
      const todayDatePart = new Date().toISOString().slice(0, 10);
      const sessionStartIso = sessionStatus?.session_start_date || `${from}T00:00:00.000Z`;
      const fromIso = (!isCustom || from === sessionStartIso.slice(0, 10)) ? sessionStartIso : `${from}T00:00:00.000Z`;
      const toIso = (!isCustom || to === todayDatePart) ? new Date().toISOString() : `${to}T23:59:59.999Z`;
      const calc = await ApiService.calculateReconciliationForRange(fromIso, toIso);
      setReconcileCalc(calc);
      setActualCash(calc.expected_cash);
      setActualUpi(calc.expected_upi);
    } catch (err) {
      console.error('Error recalculating range:', err);
    }
  };

  // Submit Close Period
  const handleConfirmClosePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileCalc) return;

    if (!closeAdminPin.trim()) {
      setFeedback({ type: 'error', message: 'Super Admin Security PIN is required to close and lock the period.' });
      return;
    }

    const actC = Number(actualCash || 0);
    const actU = Number(actualUpi || 0);
    const diffC = Number((actC - reconcileCalc.expected_cash).toFixed(2));
    const diffU = Number((actU - reconcileCalc.expected_upi).toFixed(2));

    setSubmitting(true);
    setFeedback(null);

    try {
      const todayDatePart = new Date().toISOString().slice(0, 10);
      const sessionStartIso = sessionStatus?.session_start_date || `${reconcileFromDate}T00:00:00.000Z`;
      const fromIso = (!customReconcileRange || reconcileFromDate === sessionStartIso.slice(0, 10))
        ? sessionStartIso
        : `${reconcileFromDate}T00:00:00.000Z`;
      const toIso = (!customReconcileRange || reconcileToDate === todayDatePart)
        ? new Date().toISOString()
        : `${reconcileToDate}T23:59:59.999Z`;

      await ApiService.createAccountingClosing({
        from_date: fromIso,
        to_date: toIso,
        opening_cash: reconcileCalc.opening_cash,
        opening_upi: reconcileCalc.opening_upi,
        cash_inflow: reconcileCalc.cash_inflow,
        upi_inflow: reconcileCalc.upi_inflow,
        cash_outflow: reconcileCalc.cash_outflow,
        upi_outflow: reconcileCalc.upi_outflow,
        transfers_cash_to_upi: reconcileCalc.transfers_cash_to_upi,
        transfers_upi_to_cash: reconcileCalc.transfers_upi_to_cash,
        expected_cash: reconcileCalc.expected_cash,
        expected_upi: reconcileCalc.expected_upi,
        actual_cash: actC,
        actual_upi: actU,
        cash_difference: diffC,
        upi_difference: diffU,
        discrepancy_note: discrepancyNote.trim() || null,
        status: 'CLOSED',
        is_locked: true,
        closed_by: 'Admin'
      }, closeAdminPin.trim());

      setFeedback({ 
        type: 'success', 
        message: `Accounting session closed and locked successfully! Active session sales reset to zero for new period.` 
      });
      setShowCloseModal(false);
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to close accounting session' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Internal Transfer
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Transfer amount must be greater than zero.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await ApiService.createInternalTransfer({
        direction: transferDirection,
        amount: amt,
        reason: transferReason.trim() || 'Internal Transfer',
        reference_no: transferRefNo.trim() || undefined,
        notes: transferNotes.trim() || undefined
      });

      setFeedback({ type: 'success', message: `Transfer of ₹${amt.toFixed(2)} recorded successfully.` });
      setShowTransferModal(false);
      setTransferAmount('');
      setTransferRefNo('');
      setTransferNotes('');
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to record transfer' });
    } finally {
      setSubmitting(false);
    }
  };

  // Open Record Shop Expense Modal
  const handleOpenAddExpense = () => {
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseCategory(expenseCategories[0] || 'Shop Expense');
    setExpensePaymentMode('Cash');
    setExpenseCashAmount('');
    setExpenseUpiAmount('');
    setExpenseNotes('');
    setShowExpenseModal(true);
  };

  // Submit Shop Expense (Cash / UPI / Split)
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim()) {
      setFeedback({ type: 'error', message: 'Expense description is required.' });
      return;
    }

    const amt = Number(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Amount must be greater than 0.' });
      return;
    }

    let cAmt = 0;
    let uAmt = 0;

    if (expensePaymentMode === 'Split') {
      cAmt = Number(expenseCashAmount || 0);
      uAmt = Number(expenseUpiAmount || 0);
      if (cAmt <= 0 && uAmt <= 0) {
        setFeedback({ type: 'error', message: 'Please enter Cash and/or UPI amounts for split payment.' });
        return;
      }
      if (Math.abs(cAmt + uAmt - amt) > 0.01) {
        setFeedback({ 
          type: 'error', 
          message: `Split sum (₹${(cAmt + uAmt).toFixed(2)}) must equal total expense amount (₹${amt.toFixed(2)}).` 
        });
        return;
      }
    } else if (expensePaymentMode === 'Cash') {
      cAmt = amt;
      uAmt = 0;
    } else if (expensePaymentMode === 'UPI') {
      cAmt = 0;
      uAmt = amt;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await ApiService.addExpense({
        title: expenseTitle.trim(),
        amount: amt,
        category: expenseCategory as ExpenseCategory,
        payment_mode: expensePaymentMode,
        cash_amount: cAmt,
        upi_amount: uAmt,
        notes: expenseNotes.trim() || undefined
      });

      setFeedback({
        type: 'success',
        message: `Shop expense "${expenseTitle}" of ₹${amt.toFixed(2)} (${expensePaymentMode}) recorded successfully.`
      });
      setShowExpenseModal(false);
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record shop expense'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Settle Bill Due inside Close Session Modal
  const handleOpenSettleBill = (bill: UnpaidSessionBill) => {
    setSettlingBill(bill);
    if (Number(bill.customer_advance || 0) > 0) {
      setSettlePaymentMethod('Advance');
      setSettlingAmount(Math.min(bill.due_amount, Number(bill.customer_advance || 0)));
    } else {
      setSettlePaymentMethod('Cash');
      setSettlingAmount(bill.due_amount);
    }
  };

  const handleConfirmSettleBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingBill) return;
    const amt = Number(settlingAmount);
    if (isNaN(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Settlement amount must be greater than 0.' });
      return;
    }

    setSettlingSubmitting(true);
    try {
      if (settlePaymentMethod === 'Advance') {
        if (!settlingBill.customer_id) {
          throw new Error('Cannot apply advance to a bill without a linked customer.');
        }
        await ApiService.applyAdvanceToBill(settlingBill.id, amt);
        setFeedback({
          type: 'success',
          message: `Applied ₹${amt.toFixed(2)} from Customer Advance to ${settlingBill.bill_number}.`
        });
      } else {
        await ApiService.settleBillDue({
          customer_id: settlingBill.customer_id,
          bill_id: settlingBill.id,
          amount: amt,
          payment_method: settlePaymentMethod,
          notes: `Settled during accounting session close (${settlingBill.bill_number})`
        });

        setFeedback({
          type: 'success',
          message: `Settlement of ₹${amt.toFixed(2)} via ${settlePaymentMethod} recorded for ${settlingBill.bill_number}.`
        });
      }

      setSettlingBill(null);

      // Recalculate reconciliation immediately for active close period
      await handleRecalculateCloseRange(reconcileFromDate, reconcileToDate, customReconcileRange);

      // Also refresh background data
      loadData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to record bill payment'
      });
    } finally {
      setSettlingSubmitting(false);
    }
  };

  // Submit Edit/Audit for Ended Session
  const handleSaveAuditSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClosing) return;

    if (!editAdminPin.trim()) {
      setFeedback({ type: 'error', message: 'Super Admin PIN required to save accounting audit adjustments.' });
      return;
    }

    const actC = Number(editActualCash !== '' ? editActualCash : editingClosing.actual_cash);
    const actU = Number(editActualUpi !== '' ? editActualUpi : editingClosing.actual_upi);
    const diffC = Number((actC - Number(editingClosing.expected_cash)).toFixed(2));
    const diffU = Number((actU - Number(editingClosing.expected_upi)).toFixed(2));

    setSubmitting(true);
    try {
      await ApiService.updateAccountingClosing(
        editingClosing.id,
        {
          actual_cash: actC,
          actual_upi: actU,
          cash_difference: diffC,
          upi_difference: diffU,
          discrepancy_note: editDiscrepancyNote.trim() || null,
          audit_notes: `Audited on ${new Date().toLocaleDateString('en-IN')}: Cash ₹${actC}, UPI ₹${actU}`
        },
        editAdminPin.trim()
      );

      setFeedback({ type: 'success', message: `Session ${editingClosing.closing_number || 'CLOSE'} audited and verified successfully.` });
      setEditingClosing(null);
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update audit session' });
    } finally {
      setSubmitting(false);
    }
  };

  // Print Statement PDF
  const handlePrintStatement = (closing: AccountingClosing) => {
    try {
      const doc = AccountingStatementGenerator.generateStatementPdf({
        shop_settings: settings?.shop || {},
        closing
      });
      doc.save(`Accounting-Statement-${closing.closing_number || 'Session'}.pdf`);
    } catch (err) {
      console.error('PDF generate error:', err);
      setFeedback({ type: 'error', message: 'Failed to generate PDF statement' });
    }
  };

  // Export CSV for Ended Sessions
  const handleExportClosingsCSV = () => {
    if (closings.length === 0) return;
    const headers = [
      'Session Number',
      'From Date',
      'To Date',
      'Closed At',
      'Opening Cash',
      'Opening UPI',
      'Cash Inflow',
      'UPI Inflow',
      'Cash Outflow',
      'UPI Outflow',
      'Expected Cash',
      'Expected UPI',
      'Actual Cash',
      'Actual UPI',
      'Cash Diff',
      'UPI Diff',
      'Closed By',
      'Status',
      'Discrepancy Notes'
    ];
    const rows = closings.map(c => [
      c.closing_number || 'CLOSE',
      c.from_date.slice(0, 10),
      c.to_date.slice(0, 10),
      c.closed_at,
      c.opening_cash,
      c.opening_upi,
      c.cash_inflow,
      c.upi_inflow,
      c.cash_outflow,
      c.upi_outflow,
      c.expected_cash,
      c.expected_upi,
      c.actual_cash,
      c.actual_upi,
      c.cash_difference,
      c.upi_difference,
      c.closed_by,
      c.status,
      c.discrepancy_note || ''
    ]);
    downloadCSV('accounting_closings_audit', headers, rows);
  };

  // Filter Ledger Rows (Memoized for pure idempotent render)
  const filteredLedger = React.useMemo(() => {
    const sessionStartMs = sessionStatus ? new Date(sessionStatus.session_start_date).getTime() : 0;
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return ledgerRows.filter(row => {
      const rowMs = new Date(row.date).getTime();

      // Session filter
      if (dateFilter === 'current_session' && rowMs <= sessionStartMs) {
        return false;
      }

      if (dateFilter === 'today') {
        const d = new Date(row.date);
        if (d.toDateString() !== todayStr) return false;
      } else if (dateFilter === 'yesterday') {
        const d = new Date(row.date);
        if (d.toDateString() !== yesterdayStr) return false;
      } else if (dateFilter === 'weekly') {
        const d = new Date(row.date);
        if (d < sevenDaysAgo) return false;
      } else if (dateFilter === 'custom' && customFrom && customTo) {
        const fromMs = new Date(customFrom).getTime();
        const toMs = new Date(customTo).getTime() + 86400000;
        if (rowMs < fromMs || rowMs > toMs) return false;
      }

      // In ALL view, hide duplicate vouchers so each checkout collection appears once
      if (ledgerTypeFilter === 'ALL' && row.isDuplicateVoucher) {
        return false;
      }

      // Type filter
      if (ledgerTypeFilter !== 'ALL') {
        if (ledgerTypeFilter === 'BILLS' && row.type !== 'BILL') return false;
        if (ledgerTypeFilter === 'PAYMENTS' && row.type !== 'PAYMENT') return false;
        if (ledgerTypeFilter === 'EXPENSES' && row.type !== 'EXPENSE') return false;
        if (ledgerTypeFilter === 'TRANSFERS' && row.type !== 'TRANSFER_IN' && row.type !== 'TRANSFER_OUT') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          row.description.toLowerCase().includes(q) ||
          row.refNumber.toLowerCase().includes(q) ||
          row.mode.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [ledgerRows, sessionStatus, dateFilter, customFrom, customTo, ledgerTypeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      <SupabaseBanner />

      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Accounting & Reconciliation</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
                      Active Session
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cash & UPI dual register, split expenses, contra conversions, and period closing audit.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenAddExpense}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer transition"
              >
                <Plus size={14} className="text-rose-600" />
                <span>Record Shop Expense</span>
              </button>

              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer transition"
              >
                <ArrowRightLeft size={14} className="text-blue-600" />
                <span>Cash ⇄ UPI Transfer</span>
              </button>

              <button
                onClick={handleOpenCloseModal}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition"
              >
                <Lock size={14} />
                <span>End Session (Close Period)</span>
              </button>
            </div>
          </div>

          {/* ACTIVE SESSION STATUS STRIP */}
          {sessionStatus && (
            <div className="mt-4 p-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-slate-100 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Current Open Session</p>
                  <p className="text-sm font-semibold text-white">
                    {sessionStatus.last_closed_session ? (
                      <>Active since {new Date(sessionStatus.session_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                    ) : (
                      <>Active Inception Session (No prior closes)</>
                    )}
                  </p>
                </div>
              </div>

              {/* Balances Grid */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Current Sales</span>
                  <span className="text-emerald-400 font-bold text-sm">₹{sessionStatus.current_sales.toFixed(2)}</span>
                </div>

                <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Cash in Drawer</span>
                  <span className="text-amber-300 font-bold text-sm">₹{sessionStatus.expected_cash_in_hand.toFixed(2)}</span>
                </div>

                <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">UPI / Bank Balance</span>
                  <span className="text-cyan-300 font-bold text-sm">₹{sessionStatus.expected_upi_in_hand.toFixed(2)}</span>
                </div>

                {Number(sessionStatus.current_advance_utilized || 0) > 0 && (
                  <div className="bg-teal-950/80 px-3 py-1.5 rounded-lg border border-teal-600/50">
                    <span className="text-teal-300 block text-[10px] uppercase font-sans">Advance Utilized</span>
                    <span className="text-teal-300 font-bold text-sm">₹{Number(sessionStatus.current_advance_utilized).toFixed(2)}</span>
                  </div>
                )}

                {Number(sessionStatus.customer_advances_total || 0) > 0 && (
                  <div className="bg-teal-900/60 px-3 py-1.5 rounded-lg border border-teal-500/40">
                    <span className="text-teal-200 block text-[10px] uppercase font-sans">Customer Advance Pool</span>
                    <span className="text-teal-300 font-bold text-sm">₹{Number(sessionStatus.customer_advances_total).toFixed(2)}</span>
                  </div>
                )}

                {Number(sessionStatus.pending_dues_total || 0) > 0 && (
                  <div className="bg-rose-950/80 px-3 py-1.5 rounded-lg border border-rose-500/50">
                    <span className="text-rose-300 block text-[10px] uppercase font-sans">
                      Pending Customer Dues ({sessionStatus.unpaid_bills_count || 0})
                    </span>
                    <span className="text-rose-300 font-bold text-sm">₹{Number(sessionStatus.pending_dues_total).toFixed(2)}</span>
                  </div>
                )}

                <div className="bg-indigo-900/60 px-3 py-1.5 rounded-lg border border-indigo-500/40">
                  <span className="text-indigo-200 block text-[10px] uppercase font-sans">Total Liquid Funds</span>
                  <span className="text-white font-bold text-sm">₹{(sessionStatus.expected_cash_in_hand + sessionStatus.expected_upi_in_hand).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Alert */}
          {feedback && (
            <div className={`mt-3 p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              <div className="flex items-center space-x-2">
                {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{feedback.message}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* NAVIGATION TABS */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('daybook')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition cursor-pointer ${
                activeTab === 'daybook'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileSpreadsheet size={16} />
              <span>Cash & Bank Day Book</span>
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                {filteredLedger.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('transfers')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition cursor-pointer ${
                activeTab === 'transfers'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <ArrowRightLeft size={16} />
              <span>Internal Transfers (Contra)</span>
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                {transfers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('closings')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition cursor-pointer ${
                activeTab === 'closings'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Lock size={16} />
              <span>Ended Sessions & Audit History</span>
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                {closings.length}
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center text-xs text-slate-400 gap-1.5 font-mono">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>PIN Protected Multi-Tenant Audit</span>
          </div>
        </div>

        {/* TAB 1: DAY BOOK / LEDGER */}
        {activeTab === 'daybook' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Filter and Search Bar */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {/* Date Filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {ACCOUNTING_DATE_FILTER_BUTTONS.map(btn => (
                  <button
                    key={btn.id}
                    onClick={() => setDateFilter(btn.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      dateFilter === btn.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}

                {dateFilter === 'custom' && (
                  <div className="flex items-center gap-1 ml-2">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-md"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                )}
              </div>

              {/* Search & Type Select */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search ledger..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                  />
                </div>

                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Entries</option>
                  <option value="BILLS">Bills Only</option>
                  <option value="PAYMENTS">Customer Payments</option>
                  <option value="EXPENSES">Expenses Only</option>
                  <option value="TRANSFERS">Transfers Only</option>
                </select>
              </div>
            </div>

            {/* Ledger Table */}
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm">Loading cashbook ledger...</div>
            ) : filteredLedger.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <BookOpen size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No transactions found for the selected period.</p>
                <p className="text-xs text-slate-400 mt-0.5">Try choosing &apos;All Time&apos; or record a new bill, expense, or transfer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Reference #</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Payment Mode</th>
                      <th className="px-4 py-3 text-right text-emerald-700 bg-emerald-50/50">Cash In (₹)</th>
                      <th className="px-4 py-3 text-right text-rose-700 bg-rose-50/50">Cash Out (₹)</th>
                      <th className="px-4 py-3 text-right text-cyan-700 bg-cyan-50/50">UPI In (₹)</th>
                      <th className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/50">UPI Out (₹)</th>
                      <th className="px-4 py-3 text-right font-mono text-slate-700">Running Cash</th>
                      <th className="px-4 py-3 text-right font-mono text-slate-700">Running UPI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredLedger.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(row.date).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {row.refNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-semibold max-w-xs truncate">
                          {row.description}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.mode === 'Cash' 
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : row.mode === 'UPI'
                              ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                              : 'bg-purple-50 text-purple-800 border border-purple-200'
                          }`}>
                            {row.mode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 bg-emerald-50/30">
                          {row.cashIn > 0 ? `+₹${row.cashIn.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 bg-rose-50/30">
                          {row.cashOut > 0 ? `-₹${row.cashOut.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-cyan-600 bg-cyan-50/30">
                          {row.upiIn > 0 ? `+₹${row.upiIn.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 bg-indigo-50/30">
                          {row.upiOut > 0 ? `-₹${row.upiOut.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          ₹{row.runningCash?.toFixed(2) ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                          ₹{row.runningUpi?.toFixed(2) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRANSFERS (CONTRA VOUCHERS) */}
        {activeTab === 'transfers' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cash ⇄ UPI Contra Transfers</h3>
                <p className="text-xs text-slate-500">Record money moving between the Cash drawer and UPI/Bank account.</p>
              </div>
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>New Transfer</span>
              </button>
            </div>

            {transfers.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <ArrowRightLeft size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No transfers recorded yet.</p>
                <p className="text-xs text-slate-400 mt-0.5">Use the &quot;New Transfer&quot; button when depositing cash to bank or withdrawing cash for drawer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Transfer #</th>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Direction</th>
                      <th className="px-4 py-3">Reason / Description</th>
                      <th className="px-4 py-3">Reference ID</th>
                      <th className="px-4 py-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {transfers.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">
                          {t.transfer_number || 'TRANS-—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {new Date(t.created_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {t.direction === 'CASH_TO_UPI' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                              <ArrowUpRight size={12} className="mr-1 text-cyan-600" />
                              Cash → UPI (Deposit)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <ArrowDownLeft size={12} className="mr-1 text-amber-600" />
                              UPI → Cash (Withdrawal)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">
                          {t.reason}
                          {t.notes && <p className="text-[11px] text-slate-400 font-normal italic">{t.notes}</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">
                          {t.reference_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 text-sm">
                          ₹{Number(t.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ENDED SESSIONS & AUDIT HISTORY */}
        {activeTab === 'closings' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ended Sessions & Certified Audit Archive</h3>
                <p className="text-xs text-slate-500">Historical closed periods with verified physical counts and variance audit.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportClosingsCSV}
                  disabled={closings.length === 0}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {closings.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Lock size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-700">No closed accounting sessions recorded yet.</p>
                <p className="text-xs text-slate-400 mt-0.5">Click &quot;End Session (Close Period)&quot; above when ready to verify and freeze your first period.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {closings.map(c => {
                  const fromStr = new Date(c.from_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  const toStr = new Date(c.to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  const isClean = Math.abs(c.cash_difference) < 0.01 && Math.abs(c.upi_difference) < 0.01;

                  return (
                    <div key={c.id} className="p-5 hover:bg-slate-50/80 transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold font-mono text-slate-900">
                            {c.closing_number || 'CLOSE-VERIFIED'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white flex items-center gap-1">
                            <Lock size={10} />
                            <span>LOCKED</span>
                          </span>
                          {isClean ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✓ 100% Balanced
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              ⚠️ Discrepancy Logged
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                          <Calendar size={13} className="text-slate-400" />
                          <span>Period: <span className="font-bold text-slate-900">{fromStr}</span> to <span className="font-bold text-slate-900">{toStr}</span></span>
                        </p>

                        <p className="text-[11px] text-slate-400">
                          Closed on {new Date(c.closed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} by <span className="font-semibold text-slate-600">{c.closed_by}</span>
                          {c.last_audited_at && (
                            <span className="ml-2 text-indigo-600 font-semibold">
                              (Audited: {new Date(c.last_audited_at).toLocaleDateString('en-IN')})
                            </span>
                          )}
                        </p>

                        {c.discrepancy_note && (
                          <p className="text-xs text-amber-900 bg-amber-50/80 border border-amber-200 rounded px-2.5 py-1 mt-1 max-w-xl">
                            <span className="font-bold">Audit Remark:</span> {c.discrepancy_note}
                          </p>
                        )}
                      </div>

                      {/* Verified Balances & Actions */}
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="text-right text-xs font-mono space-y-0.5">
                          <div className="text-slate-500">
                            Cash: <span className="font-bold text-slate-900">₹{Number(c.actual_cash).toFixed(2)}</span>
                            {c.cash_difference !== 0 && (
                              <span className={`ml-1 text-[11px] font-bold ${c.cash_difference > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                ({c.cash_difference > 0 ? '+' : ''}₹{c.cash_difference.toFixed(2)})
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500">
                            UPI: <span className="font-bold text-slate-900">₹{Number(c.actual_upi).toFixed(2)}</span>
                            {c.upi_difference !== 0 && (
                              <span className={`ml-1 text-[11px] font-bold ${c.upi_difference > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                ({c.upi_difference > 0 ? '+' : ''}₹{c.upi_difference.toFixed(2)})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handlePrintStatement(c)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-xs flex items-center space-x-1 cursor-pointer transition"
                            title="Print Certified PDF Statement"
                          >
                            <Printer size={13} className="text-indigo-600" />
                            <span>PDF</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingClosing(c);
                              setEditActualCash(c.actual_cash);
                              setEditActualUpi(c.actual_upi);
                              setEditDiscrepancyNote(c.discrepancy_note || '');
                              setEditAdminPin('');
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg shadow-xs flex items-center space-x-1 cursor-pointer transition"
                            title="Audit & Edit Session"
                          >
                            <Edit3 size={13} />
                            <span>Audit / Edit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: NEW INTERNAL TRANSFER */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <ArrowRightLeft size={18} className="text-blue-600" />
                <span>Cash ⇄ UPI Contra Transfer</span>
              </h2>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Transfer Direction *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTransferDirection('CASH_TO_UPI');
                      setTransferReason('Cash Deposited to Bank');
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      transferDirection === 'CASH_TO_UPI'
                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1">
                      <ArrowUpRight size={14} className="text-blue-600" />
                      <span>Cash → UPI</span>
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">Drawer Deposit to Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTransferDirection('UPI_TO_CASH');
                      setTransferReason('ATM Cash Withdrawal for Drawer');
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      transferDirection === 'UPI_TO_CASH'
                        ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1">
                      <ArrowDownLeft size={14} className="text-amber-600" />
                      <span>UPI → Cash</span>
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">Bank to Cash Drawer</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transfer Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank Deposit, ATM Cash Withdrawal, Customer Exchange"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference No / Bank UTR (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Deposit Slip #1042, UPI Ref #9098"
                  value={transferRefNo}
                  onChange={(e) => setTransferRefNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Record Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CLOSE SESSION (RECONCILIATION & CROSS-CHECKING WIZARD) */}
      {showCloseModal && reconcileCalc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                  <Lock size={20} className="text-indigo-600" />
                  <span>Cross-Checking & Session Closing Wizard</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify drawer cash & bank balances, check discrepancies, and freeze accounting.
                </p>
              </div>
              <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmClosePeriod} className="space-y-5">
              {/* DATE RANGE SELECTOR */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Session Audit Period</span>
                  <span className="text-xs font-semibold text-indigo-600">
                    Total Bills in Period: <span className="font-bold">{reconcileCalc.bills_count}</span> (₹{reconcileCalc.total_sales.toFixed(2)})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date</label>
                    <input
                      type="date"
                      value={reconcileFromDate}
                      onChange={(e) => {
                        setReconcileFromDate(e.target.value);
                        handleRecalculateCloseRange(e.target.value, reconcileToDate);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date (Closing Cutoff)</label>
                    <input
                      type="date"
                      value={reconcileToDate}
                      onChange={(e) => {
                        setReconcileToDate(e.target.value);
                        handleRecalculateCloseRange(reconcileFromDate, e.target.value);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* SESSION DUES VERIFICATION (ZERO DUES POLICY) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} className={reconcileCalc.pending_session_dues > 0 ? "text-amber-600" : "text-emerald-600"} />
                    <span>Session Dues Verification</span>
                  </span>
                  {reconcileCalc.pending_session_dues > 0 ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      {reconcileCalc.unpaid_bills.length} Unsettled Bills (₹{reconcileCalc.pending_session_dues.toFixed(2)} Due)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Zero Outstanding Dues (Fully Cleared)
                    </span>
                  )}
                </div>

                {reconcileCalc.pending_session_dues > 0 ? (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-start gap-2 text-amber-900 text-xs">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Accounting session cannot be closed with pending customer dues.</p>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          The following {reconcileCalc.unpaid_bills.length} bill(s) created during this session period have unpaid balances. Settle them below before certifying the session closing.
                        </p>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-amber-200/60 border border-amber-200 rounded-lg bg-white">
                      {reconcileCalc.unpaid_bills.map((ub) => (
                        <div key={ub.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">{ub.bill_number}</span>
                              <span className="text-slate-700 font-semibold truncate">{ub.customer_name}</span>
                              {Number(ub.customer_advance || 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 font-mono">
                                  Adv Avail: ₹{Number(ub.customer_advance).toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                              <span>Bill Total: ₹{ub.grand_total.toFixed(2)}</span>
                              <span>•</span>
                              <span>Paid: ₹{ub.paid_total.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="text-[10px] text-rose-500 uppercase font-bold block">Pending Due</span>
                              <span className="font-mono font-extrabold text-rose-600 text-sm">₹{ub.due_amount.toFixed(2)}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenSettleBill(ub)}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer transition"
                            >
                              <CheckCircle2 size={12} />
                              <span>Clear Due</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>All bills created in this session period are 100% paid without any outstanding dues. Period is ready for certification.</span>
                  </div>
                )}
              </div>

              {/* SIDE-BY-SIDE RECONCILIATION SHEET */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between">
                  <span>Reconciliation Breakdown</span>
                  <span className="font-mono text-slate-500 text-[11px]">Formula: Opening + Inflow - Outflow ± Transfers = Expected</span>
                </div>

                {Number(reconcileCalc.advance_utilized || 0) > 0 && (
                  <div className="m-3 p-2.5 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between text-xs text-teal-900">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Wallet size={14} className="text-teal-700" />
                      Customer Advance Utilized (Non-Cash Bill Settlement):
                    </span>
                    <span className="font-mono font-bold text-teal-800 text-sm">
                      ₹{Number(reconcileCalc.advance_utilized).toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="p-4 grid grid-cols-2 gap-4">
                  {/* CASH COLUMN */}
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-2 text-xs">
                    <p className="font-bold text-amber-900 border-b border-amber-200 pb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Wallet size={14} /> Physical Cash Drawer</span>
                      <span className="font-mono text-amber-700 font-bold">Cash</span>
                    </p>
                    <div className="space-y-1 text-[11px] font-mono text-slate-700">
                      <div className="flex justify-between">
                        <span>Opening Cash (B/F):</span>
                        <span className="font-semibold">₹{reconcileCalc.opening_cash.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>(+) Cash Collected:</span>
                        <span className="font-semibold">+₹{reconcileCalc.cash_inflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span>(-) Cash Expenses:</span>
                        <span className="font-semibold">-₹{reconcileCalc.cash_outflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>(±) Contra Transfers:</span>
                        <span className="font-semibold">
                          {(reconcileCalc.transfers_upi_to_cash - reconcileCalc.transfers_cash_to_upi) >= 0 ? '+' : ''}
                          ₹{(reconcileCalc.transfers_upi_to_cash - reconcileCalc.transfers_cash_to_upi).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-amber-300 pt-1.5 font-bold text-amber-950 text-xs">
                        <span>Expected Closing Cash:</span>
                        <span>₹{reconcileCalc.expected_cash.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200 space-y-1">
                      <label className="block text-[11px] font-bold text-amber-900">Actual Counted Cash (₹) *</label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        value={actualCash}
                        onChange={(e) => setActualCash(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="text-[11px] font-mono font-semibold pt-0.5">
                        {actualCash !== '' && (
                          <span className={Number(actualCash) - reconcileCalc.expected_cash === 0 ? 'text-emerald-700' : 'text-rose-600'}>
                            {Number(actualCash) - reconcileCalc.expected_cash === 0 ? '✓ Balanced' : `Diff: ₹${(Number(actualCash) - reconcileCalc.expected_cash).toFixed(2)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* UPI COLUMN */}
                  <div className="p-3.5 bg-cyan-50/60 border border-cyan-200/80 rounded-xl space-y-2 text-xs">
                    <p className="font-bold text-cyan-900 border-b border-cyan-200 pb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Smartphone size={14} /> UPI / Bank Account</span>
                      <span className="font-mono text-cyan-700 font-bold">UPI</span>
                    </p>
                    <div className="space-y-1 text-[11px] font-mono text-slate-700">
                      <div className="flex justify-between">
                        <span>Opening UPI (B/F):</span>
                        <span className="font-semibold">₹{reconcileCalc.opening_upi.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>(+) UPI Collected:</span>
                        <span className="font-semibold">+₹{reconcileCalc.upi_inflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span>(-) UPI Expenses:</span>
                        <span className="font-semibold">-₹{reconcileCalc.upi_outflow.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>(±) Contra Transfers:</span>
                        <span className="font-semibold">
                          {(reconcileCalc.transfers_cash_to_upi - reconcileCalc.transfers_upi_to_cash) >= 0 ? '+' : ''}
                          ₹{(reconcileCalc.transfers_cash_to_upi - reconcileCalc.transfers_upi_to_cash).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-cyan-300 pt-1.5 font-bold text-cyan-950 text-xs">
                        <span>Expected Closing UPI:</span>
                        <span>₹{reconcileCalc.expected_upi.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-cyan-200 space-y-1">
                      <label className="block text-[11px] font-bold text-cyan-900">Actual Bank/UPI Balance (₹) *</label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        value={actualUpi}
                        onChange={(e) => setActualUpi(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-cyan-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <div className="text-[11px] font-mono font-semibold pt-0.5">
                        {actualUpi !== '' && (
                          <span className={Number(actualUpi) - reconcileCalc.expected_upi === 0 ? 'text-emerald-700' : 'text-rose-600'}>
                            {Number(actualUpi) - reconcileCalc.expected_upi === 0 ? '✓ Balanced' : `Diff: ₹${(Number(actualUpi) - reconcileCalc.expected_upi).toFixed(2)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* REMARKS & SUPER ADMIN PIN */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discrepancy Explanation / Audit Notes (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. ₹50 petty cash difference due to coin change rounding."
                    value={discrepancyNote}
                    onChange={(e) => setDiscrepancyNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-indigo-900 text-xs font-bold">
                    <ShieldCheck size={16} className="text-indigo-600" />
                    <span>Super Admin PIN Authorization *</span>
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    Closing this session will freeze all transactions up to {reconcileToDate}. Enter your Security PIN to certify this closing.
                  </p>
                  <input
                    type="password"
                    required
                    placeholder="Enter Security PIN (e.g. 1234)"
                    value={closeAdminPin}
                    onChange={(e) => setCloseAdminPin(e.target.value)}
                    className="w-full max-w-xs bg-white border border-indigo-300 rounded-lg px-3 py-2 text-xs font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* MODAL ACTIONS */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="submit"
                    disabled={submitting || (reconcileCalc.pending_session_dues > 0)}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 cursor-pointer"
                    title={reconcileCalc.pending_session_dues > 0 ? "Clear all session dues above before closing" : undefined}
                  >
                    <Lock size={14} />
                    <span>
                      {submitting
                        ? 'Certifying & Freezing...'
                        : reconcileCalc.pending_session_dues > 0
                        ? `Cannot Close (${reconcileCalc.unpaid_bills.length} Dues Pending)`
                        : 'Confirm & Freeze Period'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: AUDIT / EDIT ENDED SESSION */}
      {editingClosing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Edit3 size={18} className="text-indigo-600" />
                <span>Audit & Adjust Session {editingClosing.closing_number}</span>
              </h2>
              <button onClick={() => setEditingClosing(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAuditSession} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Period:</span>
                  <span className="font-bold">{editingClosing.from_date.slice(0, 10)} to {editingClosing.to_date.slice(0, 10)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Expected Cash:</span>
                  <span className="font-mono">₹{Number(editingClosing.expected_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Expected UPI:</span>
                  <span className="font-mono">₹{Number(editingClosing.expected_upi).toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audited Actual Cash (₹)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={editActualCash}
                    onChange={(e) => setEditActualCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audited Actual UPI (₹)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={editActualUpi}
                    onChange={(e) => setEditActualUpi(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Notes / Adjustments</label>
                <textarea
                  rows={2}
                  placeholder="Reason for adjustment / audit clarification..."
                  value={editDiscrepancyNote}
                  onChange={(e) => setEditDiscrepancyNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                <label className="block text-xs font-bold text-amber-900">Super Admin PIN Required *</label>
                <input
                  type="password"
                  required
                  placeholder="Security PIN"
                  value={editAdminPin}
                  onChange={(e) => setEditAdminPin(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs font-mono tracking-widest"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClosing(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving Audit...' : 'Save Audit Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: QUICK SETTLE BILL DUE MODAL */}
      {settlingBill && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Clear Bill Due</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{settlingBill.bill_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlingBill(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmSettleBill} className="space-y-3.5">
              <div className="p-2.5 bg-slate-50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-800">{settlingBill.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bill Total:</span>
                  <span className="font-mono font-semibold">₹{settlingBill.grand_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-600 font-bold border-t border-slate-200 pt-1">
                  <span>Outstanding Balance:</span>
                  <span className="font-mono">₹{settlingBill.due_amount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <div className={`grid gap-2 ${Number(settlingBill.customer_advance || 0) > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSettlePaymentMethod('Cash');
                      setSettlingAmount(settlingBill.due_amount);
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      settlePaymentMethod === 'Cash'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Wallet size={14} className="text-amber-600" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettlePaymentMethod('UPI');
                      setSettlingAmount(settlingBill.due_amount);
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      settlePaymentMethod === 'UPI'
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-900 ring-2 ring-cyan-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone size={14} className="text-cyan-600" />
                    <span>UPI / Bank</span>
                  </button>
                  {Number(settlingBill.customer_advance || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettlePaymentMethod('Advance');
                        setSettlingAmount(Math.min(settlingBill.due_amount, Number(settlingBill.customer_advance || 0)));
                      }}
                      className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        settlePaymentMethod === 'Advance'
                          ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-500/20'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CheckCircle2 size={14} className="text-teal-600" />
                      <span>Advance (₹{Number(settlingBill.customer_advance).toFixed(0)})</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {settlePaymentMethod === 'Advance' ? 'Advance Amount to Apply (₹) *' : 'Amount to Collect (₹) *'}
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  max={
                    settlePaymentMethod === 'Advance'
                      ? Math.min(settlingBill.due_amount, Number(settlingBill.customer_advance || 0))
                      : settlingBill.due_amount
                  }
                  value={settlingAmount}
                  onChange={(e) => setSettlingAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettlingBill(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settlingSubmitting}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {settlingSubmitting ? 'Recording...' : 'Collect & Clear Due'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: RECORD SHOP EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus size={18} className="text-rose-600" />
                <span>Record Shop Expense</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expense Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Purchased A4 Paper Rim, Shop Electricity Bill"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                  >
                    {expenseCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={expensePaymentMode}
                    onChange={(e) => {
                      const mode = e.target.value as 'Cash' | 'UPI' | 'Split';
                      setExpensePaymentMode(mode);
                      if (mode === 'Split' && expenseAmount && !expenseCashAmount && !expenseUpiAmount) {
                        setExpenseCashAmount(Number(expenseAmount));
                        setExpenseUpiAmount(0);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                  >
                    <option value="Cash">Cash (Drawer)</option>
                    <option value="UPI">UPI (Bank Account)</option>
                    <option value="Split">Split (Cash + UPI)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Total Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setExpenseAmount(val);
                    if (expensePaymentMode === 'Split' && typeof val === 'number') {
                      if (typeof expenseCashAmount === 'number' && expenseCashAmount <= val) {
                        setExpenseUpiAmount(val - expenseCashAmount);
                      } else {
                        setExpenseCashAmount(val);
                        setExpenseUpiAmount(0);
                      }
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>

              {/* SPLIT BREAKDOWN */}
              {expensePaymentMode === 'Split' && (
                <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Split Cash & UPI Breakdown</span>
                    <span className="text-[11px] font-mono font-bold text-amber-800">
                      Sum: ₹{((Number(expenseCashAmount) || 0) + (Number(expenseUpiAmount) || 0)).toFixed(2)} / ₹{Number(expenseAmount || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">Cash Paid (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseCashAmount}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setExpenseCashAmount(val);
                          if (typeof expenseAmount === 'number' && typeof val === 'number') {
                            setExpenseUpiAmount(Math.max(0, expenseAmount - val));
                          }
                        }}
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">UPI Paid (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={expenseUpiAmount}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setExpenseUpiAmount(val);
                        }}
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Receipt Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Receipt #401, Vendor: Metro Stationery"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
