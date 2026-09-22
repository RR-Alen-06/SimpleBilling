import { jsPDF } from 'jspdf';
import { CustomerStatementData } from '../types';

export class StatementGenerator {
  /**
   * Generates a clean, multi-page vector-styled Customer Consolidated Purchase Statement PDF using jsPDF
   */
  static generateStatementPdf(data: CustomerStatementData): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - 15) {
        doc.addPage();
        y = margin;
        renderHeaderMinimal();
      }
    };

    const renderHeaderMinimal = () => {
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`${data.shop_settings.shop_name} — Consolidated Customer Statement`, margin, y);
      doc.text(`Customer: ${data.customer.name}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    };

    // --- 1. SHOP HEADER & STATEMENT TITLE ---
    doc.setFillColor(30, 41, 59); // slate-800
    doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(data.shop_settings.shop_name || 'PRINT & BILLING CENTER', margin + 6, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // slate-300
    const contactInfo = [
      data.shop_settings.address,
      data.shop_settings.phone ? `Phone: ${data.shop_settings.phone}` : null,
      data.shop_settings.gst_number ? `GSTIN: ${data.shop_settings.gst_number}` : null
    ].filter(Boolean).join(' | ');
    doc.text(contactInfo, margin + 6, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(129, 140, 248); // indigo-300
    doc.text('CONSOLIDATED PURCHASE STATEMENT', pageWidth - margin - 6, y + 8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Period: ${data.period.filter_label}`, pageWidth - margin - 6, y + 14, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`, pageWidth - margin - 6, y + 19, { align: 'right' });

    y += 28;

    // --- 2. CUSTOMER PROFILE CARD ---
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('CUSTOMER PROFILE', margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Name: ${data.customer.name}`, margin + 4, y + 11);
    doc.text(`Mobile: ${data.customer.mobile || 'N/A'}`, margin + 4, y + 16);

    const midX = margin + contentWidth / 2;
    doc.text(`Email: ${data.customer.email || 'N/A'}`, midX, y + 11);
    doc.text(`Customer Code: ${data.customer.customer_code || 'CUST-' + data.customer.id.slice(0, 6).toUpperCase()}`, midX, y + 16);

    const rightX = pageWidth - margin - 4;
    const dueStatus = (data.reconciliation.current_outstanding_balance > 0) ? 'Balance Due' : 'All Dues Clear';
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(data.reconciliation.current_outstanding_balance > 0 ? 185 : 22, data.reconciliation.current_outstanding_balance > 0 ? 28 : 101, data.reconciliation.current_outstanding_balance > 0 ? 28 : 52);
    doc.text(`Status: ${dueStatus}`, rightX, y + 11, { align: 'right' });

    if (data.reconciliation.advance_balance > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(5, 150, 105);
      doc.text(`Advance Balance: ₹${data.reconciliation.advance_balance.toFixed(2)}`, rightX, y + 16, { align: 'right' });
    }

    y += 24;

    // --- 3. PERIOD KPI SUMMARY TILES ---
    const tileGap = 3;
    const tileWidth = (contentWidth - tileGap * 3) / 4;
    const tileHeight = 14;

    const kpiCards = [
      { label: 'Total Invoiced', value: `₹${data.kpi.total_invoiced.toFixed(2)}`, color: [30, 41, 59] },
      { label: 'Total Paid', value: `₹${data.kpi.total_paid.toFixed(2)}`, color: [16, 185, 129] },
      { label: 'Invoices Count', value: `${data.kpi.invoices_count}`, color: [79, 70, 229] },
      { label: 'Total Units Bought', value: `${data.kpi.total_units_bought}`, color: [217, 119, 6] }
    ];

    kpiCards.forEach((kpi, idx) => {
      const tx = margin + idx * (tileWidth + tileGap);
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(tx, y, tileWidth, tileHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, tx + tileWidth / 2, y + 4.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.value, tx + tileWidth / 2, y + 10.5, { align: 'center' });
    });

    y += tileHeight + 6;

    // --- 4. DATE-GROUPED ITEMIZED PURCHASE HISTORY ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('ITEMIZED PURCHASE HISTORY', margin, y);
    y += 4;

    if (data.date_groups.length === 0) {
      checkPageBreak(15);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, 12, 1, 1, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('No purchase transactions found for this selected period.', margin + contentWidth / 2, y + 7.5, { align: 'center' });
      y += 16;
    } else {
      for (const dateGroup of data.date_groups) {
        checkPageBreak(12);

        // Date Banner
        doc.setFillColor(224, 231, 255); // indigo-100
        doc.setDrawColor(199, 210, 254);
        doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(67, 56, 202); // indigo-700
        doc.text(`📅 Purchase Date: ${dateGroup.date_formatted} (${dateGroup.bills.length} Bill${dateGroup.bills.length > 1 ? 's' : ''})`, margin + 3, y + 4.2);
        y += 8;

        for (const bill of dateGroup.bills) {
          checkPageBreak(18 + bill.items.length * 6);

          // Bill Header Bar
          doc.setFillColor(241, 245, 249); // slate-100
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, y, contentWidth, 6, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          doc.text(`Invoice: ${bill.bill_number}`, margin + 3, y + 4.2);

          const billTime = new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`Time: ${billTime}`, margin + 45, y + 4.2);

          doc.setFont('helvetica', 'bold');
          const isFullyPaid = bill.balance_due <= 0.01;
          doc.setTextColor(isFullyPaid ? 22 : 185, isFullyPaid ? 101 : 28, isFullyPaid ? 52 : 28);
          doc.text(isFullyPaid ? '● Fully Paid' : `● Due: ₹${bill.balance_due.toFixed(2)}`, pageWidth - margin - 3, y + 4.2, { align: 'right' });
          y += 6;

          // Items Table Header
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, 5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(71, 85, 105);

          const colNo = margin + 3;
          const colDesc = margin + 12;
          const colQty = margin + contentWidth - 65;
          const colRate = margin + contentWidth - 35;
          const colTotal = margin + contentWidth - 3;

          doc.text('#', colNo, y + 3.5);
          doc.text('Product Description', colDesc, y + 3.5);
          doc.text('Qty', colQty, y + 3.5, { align: 'right' });
          doc.text('Unit Price', colRate, y + 3.5, { align: 'right' });
          doc.text('Line Total', colTotal, y + 3.5, { align: 'right' });
          y += 5;

          // Item Rows
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);

          bill.items.forEach((item, idx) => {
            checkPageBreak(6);
            if (idx % 2 === 1) {
              doc.setFillColor(250, 250, 250);
              doc.rect(margin, y, contentWidth, 5, 'F');
            }

            doc.text(`${item.item_index}`, colNo, y + 3.5);
            doc.text(item.product_name, colDesc, y + 3.5);
            doc.text(`${item.quantity}`, colQty, y + 3.5, { align: 'right' });
            doc.text(`₹${item.price.toFixed(2)}`, colRate, y + 3.5, { align: 'right' });
            doc.text(`₹${item.total.toFixed(2)}`, colTotal, y + 3.5, { align: 'right' });
            y += 5;
          });

          // Bill Subtotals & Summary
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, y, pageWidth - margin, y);
          y += 1;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);

          const subtotalSummary = [
            bill.discount > 0 ? `Discount: ₹${bill.discount.toFixed(2)}` : null,
            `Grand Total: ₹${bill.grand_total.toFixed(2)}`,
            `Amount Paid: ₹${bill.paid_amount.toFixed(2)}`
          ].filter(Boolean).join('   |   ');

          doc.text(subtotalSummary, pageWidth - margin - 3, y + 4, { align: 'right' });
          y += 7;
        }

        y += 3;
      }
    }

    // --- 5. FINAL STATEMENT RECONCILIATION BANNER ---
    checkPageBreak(26);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('STATEMENT RECONCILIATION & BALANCE SUMMARY', margin + 4, y + 5.5);

    const reconWidth = contentWidth / 3;
    const rY = y + 10;

    // Period Purchases
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Period Total Purchases:', margin + 4, rY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`₹${data.reconciliation.period_purchases.toFixed(2)}`, margin + 4, rY + 5.5);

    // Period Payments
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Period Payments Received:', margin + reconWidth, rY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(16, 185, 129);
    doc.text(`₹${data.reconciliation.period_payments.toFixed(2)}`, margin + reconWidth, rY + 5.5);

    // Current Outstanding Due
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Current Ledger Balance Due:', margin + reconWidth * 2, rY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const hasDue = data.reconciliation.current_outstanding_balance > 0;
    doc.setTextColor(hasDue ? 220 : 22, hasDue ? 38 : 101, hasDue ? 38 : 52);
    doc.text(`₹${data.reconciliation.current_outstanding_balance.toFixed(2)}`, margin + reconWidth * 2, rY + 5.5);

    y += 24;

    // Footer note
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const footerMsg = data.shop_settings.footer_message || 'Thank you for your business. For any queries regarding this statement, please contact the store.';
    doc.text(footerMsg, margin + contentWidth / 2, pageHeight - 8, { align: 'center' });

    return doc;
  }

  /**
   * Generates and downloads the PDF directly in the browser
   */
  static downloadStatementPdf(data: CustomerStatementData): void {
    const doc = this.generateStatementPdf(data);
    const safeCustName = data.customer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Statement_${safeCustName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  }

  /**
   * Opens the statement PDF in a new window/tab for instant printing
   */
  static printCustomerStatementPdf(data: CustomerStatementData): void {
    const doc = this.generateStatementPdf(data);
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  }
}
