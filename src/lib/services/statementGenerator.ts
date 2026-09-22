import { jsPDF } from 'jspdf';
import { CustomerStatementData } from '../types';

export class StatementGenerator {
  /**
   * Generates an executive-grade, high-contrast monochrome Customer Consolidated Purchase Statement PDF.
   * Optimized for crystal-clear A4 printing and archival accounting.
   */
  static generateStatementPdf(data: CustomerStatementData): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Helper for pagination tracking
    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - 18) {
        doc.addPage();
        y = margin;
        renderRunningHeader();
      }
    };

    const renderRunningHeader = () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`${data.shop_settings.shop_name} — Consolidated Customer Statement`, margin, y);
      doc.text(`Customer: ${data.customer.name} | Period: ${data.period.filter_label}`, pageWidth - margin, y, { align: 'right' });
      y += 3.5;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    };

    // =========================================================================
    // 1. TOP HEADER & METADATA (Monochrome Executive Dual-Column)
    // =========================================================================
    // Top border accent
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    // Store details (Left Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(data.shop_settings.shop_name || 'PRINT & BILLING CENTER', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    y += 4.5;
    if (data.shop_settings.address) {
      doc.text(data.shop_settings.address, margin, y);
      y += 4;
    }
    const storeMeta = [
      data.shop_settings.phone ? `Phone: ${data.shop_settings.phone}` : null,
      data.shop_settings.gst_number ? `GSTIN: ${data.shop_settings.gst_number}` : null
    ].filter(Boolean).join('   |   ');
    if (storeMeta) {
      doc.text(storeMeta, margin, y);
      y += 4;
    }

    // Document Details (Right Column)
    const rightX = pageWidth - margin;
    let rightY = margin + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('STATEMENT OF ACCOUNT', rightX, rightY, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    rightY += 4.5;
    doc.text(`Statement Period: ${data.period.filter_label}`, rightX, rightY, { align: 'right' });
    rightY += 4;
    doc.text(`Issue Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, rightX, rightY, { align: 'right' });
    rightY += 4;
    doc.text(`Account Code: ${data.customer.customer_code || 'CUST-' + data.customer.id.slice(0, 6).toUpperCase()}`, rightX, rightY, { align: 'right' });

    y = Math.max(y, rightY) + 3;

    // Divider line
    doc.setLineWidth(0.2);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4.5;

    // =========================================================================
    // 2. CUSTOMER PROFILE CARD (Structured Bordered Box)
    // =========================================================================
    const custBoxHeight = 17;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, custBoxHeight);

    // Box Header Label
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, contentWidth, 5, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, y + 5, margin + contentWidth, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('CUSTOMER ACCOUNT INFORMATION', margin + 3, y + 3.6);

    const isSettled = data.reconciliation.current_outstanding_balance <= 0.01;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(`ACCOUNT STATUS: ${isSettled ? 'DUES SETTLED (NIL)' : `OUTSTANDING DUE: Rs. ${data.reconciliation.current_outstanding_balance.toFixed(2)}`}`, rightX - 3, y + 3.6, { align: 'right' });

    // Customer details row
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    const infoY = y + 9.5;
    doc.text(`Name: `, margin + 3, infoY);
    doc.setFont('helvetica', 'bold');
    doc.text(data.customer.name, margin + 13, infoY);

    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${data.customer.mobile || 'N/A'}`, margin + 65, infoY);
    doc.text(`Email: ${data.customer.email || 'N/A'}`, margin + 115, infoY);

    if (data.reconciliation.advance_balance > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Advance Credit: Rs. ${data.reconciliation.advance_balance.toFixed(2)}`, rightX - 3, infoY, { align: 'right' });
    }

    y += custBoxHeight + 4;

    // =========================================================================
    // 3. EXECUTIVE KPI MATRIX TILES
    // =========================================================================
    const kpiCount = 4;
    const kpiWidth = contentWidth / kpiCount;
    const kpiHeight = 11;

    const kpiItems = [
      { label: 'TOTAL INVOICED (DEBIT)', value: `Rs. ${data.kpi.total_invoiced.toFixed(2)}` },
      { label: 'TOTAL PAID (CREDIT)', value: `Rs. ${data.kpi.total_paid.toFixed(2)}` },
      { label: 'TOTAL INVOICES', value: `${data.kpi.invoices_count} Bills` },
      { label: 'TOTAL UNITS BOUGHT', value: `${data.kpi.total_units_bought} Units` }
    ];

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, kpiHeight);

    kpiItems.forEach((kpi, idx) => {
      const kX = margin + idx * kpiWidth;
      if (idx > 0) {
        doc.line(kX, y, kX, y + kpiHeight);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(80, 80, 80);
      doc.text(kpi.label, kX + kpiWidth / 2, y + 3.8, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(kpi.value, kX + kpiWidth / 2, y + 8.5, { align: 'center' });
    });

    y += kpiHeight + 5;

    // =========================================================================
    // 4. ITEMIZED PURCHASE LEDGER TABLE (Monochrome Grid Layout)
    // =========================================================================
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('ITEMIZED TRANSACTION & PURCHASE HISTORY', margin, y);
    y += 3;

    // Table Column Coordinates
    const colIdx = margin + 2;               // # (6mm)
    const colDate = margin + 8;              // Date & Time (26mm)
    const colBill = margin + 34;             // Bill Number (20mm)
    const colDesc = margin + 56;             // Product Description (60mm)
    const colQty = margin + 120;             // Qty (14mm, right)
    const colRate = margin + 142;            // Unit Rate (18mm, right)
    const colDisc = margin + 162;            // Discount (16mm, right)
    const colTotal = margin + contentWidth;  // Line Total (24mm, right)

    const renderTableHeader = () => {
      doc.setFillColor(240, 240, 240);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(margin, y, contentWidth, 5.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);

      doc.text('#', colIdx, y + 3.8);
      doc.text('DATE', colDate, y + 3.8);
      doc.text('INVOICE #', colBill, y + 3.8);
      doc.text('PRODUCT / SERVICE DESCRIPTION', colDesc, y + 3.8);
      doc.text('QTY', colQty, y + 3.8, { align: 'right' });
      doc.text('RATE (Rs.)', colRate, y + 3.8, { align: 'right' });
      doc.text('DISC (Rs.)', colDisc, y + 3.8, { align: 'right' });
      doc.text('TOTAL (Rs.)', colTotal - 2, y + 3.8, { align: 'right' });

      y += 5.5;
    };

    renderTableHeader();

    if (data.date_groups.length === 0) {
      checkPageBreak(12);
      doc.setDrawColor(180, 180, 180);
      doc.rect(margin, y, contentWidth, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('No purchase transactions recorded in this selected period.', margin + contentWidth / 2, y + 6, { align: 'center' });
      y += 14;
    } else {
      let overallIndex = 1;

      for (const group of data.date_groups) {
        for (const bill of group.bills) {
          const billTime = new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

          bill.items.forEach((item, itemIdx) => {
            checkPageBreak(5);

            // Row background and borders
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.15);
            doc.line(margin, y + 4.5, margin + contentWidth, y + 4.5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(0, 0, 0);

            // Row Index
            doc.text(`${overallIndex++}`, colIdx, y + 3.2);

            // Date & Invoice only on the first item of a bill
            if (itemIdx === 0) {
              doc.text(`${group.date_formatted}`, colDate, y + 3.2);
              doc.setFont('helvetica', 'bold');
              doc.text(bill.bill_number, colBill, y + 3.2);
              doc.setFont('helvetica', 'normal');
            } else {
              doc.setTextColor(150, 150, 150);
              doc.text('"', colDate + 8, y + 3.2);
              doc.text('"', colBill + 6, y + 3.2);
              doc.setTextColor(0, 0, 0);
            }

            // Description
            const cleanName = item.product_name.length > 34 ? item.product_name.slice(0, 32) + '..' : item.product_name;
            doc.text(cleanName, colDesc, y + 3.2);

            // Qty, Rate, Discount, Total
            doc.text(`${item.quantity}`, colQty, y + 3.2, { align: 'right' });
            doc.text(`${item.price.toFixed(2)}`, colRate, y + 3.2, { align: 'right' });
            doc.text(itemIdx === 0 && bill.discount > 0 ? `${bill.discount.toFixed(2)}` : '0.00', colDisc, y + 3.2, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.text(`${item.total.toFixed(2)}`, colTotal - 2, y + 3.2, { align: 'right' });

            y += 4.5;
          });

          // Bill Subtotal Row
          checkPageBreak(5);
          doc.setFillColor(248, 248, 248);
          doc.rect(margin, y, contentWidth, 4.5, 'F');
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.2);
          doc.line(margin, y + 4.5, margin + contentWidth, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(60, 60, 60);
          doc.text(`Bill Ref: ${bill.bill_number} (${billTime})`, colDesc, y + 3.2);

          const isFullyPaid = bill.balance_due <= 0.01;
          const statusText = isFullyPaid ? 'Status: Fully Paid' : `Status: Due Rs. ${bill.balance_due.toFixed(2)}`;
          doc.text(statusText, colQty, y + 3.2, { align: 'right' });

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(`Paid: Rs. ${bill.paid_amount.toFixed(2)}`, colDisc, y + 3.2, { align: 'right' });
          doc.text(`Bill Total: Rs. ${bill.grand_total.toFixed(2)}`, colTotal - 2, y + 3.2, { align: 'right' });

          y += 5.5;
        }
      }
    }

    // Outer table border
    y += 1;

    // =========================================================================
    // 5. FINANCIAL RECONCILIATION SUMMARY (High Contrast Table)
    // =========================================================================
    checkPageBreak(38);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('STATEMENT RECONCILIATION & CLOSING BALANCE', margin, y);
    y += 3.5;

    const reconHeight = 22;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, reconHeight);

    const rColWidth = contentWidth / 4;

    // Header row
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, contentWidth, 5, 'F');
    doc.line(margin, y + 5, margin + contentWidth, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text('PERIOD PURCHASES', margin + rColWidth * 0.5, y + 3.5, { align: 'center' });
    doc.text('PERIOD PAYMENTS RECEIVED', margin + rColWidth * 1.5, y + 3.5, { align: 'center' });
    doc.text('CUSTOMER ADVANCE CREDIT', margin + rColWidth * 2.5, y + 3.5, { align: 'center' });
    doc.text('NET CLOSING BALANCE DUE', margin + rColWidth * 3.5, y + 3.5, { align: 'center' });

    // Vertical column lines
    doc.line(margin + rColWidth, y, margin + rColWidth, y + reconHeight);
    doc.line(margin + rColWidth * 2, y, margin + rColWidth * 2, y + reconHeight);
    doc.line(margin + rColWidth * 3, y, margin + rColWidth * 3, y + reconHeight);

    // Value Row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    const valY = y + 13;
    doc.text(`Rs. ${data.reconciliation.period_purchases.toFixed(2)}`, margin + rColWidth * 0.5, valY, { align: 'center' });
    doc.text(`Rs. ${data.reconciliation.period_payments.toFixed(2)}`, margin + rColWidth * 1.5, valY, { align: 'center' });
    doc.text(`Rs. ${data.reconciliation.advance_balance.toFixed(2)}`, margin + rColWidth * 2.5, valY, { align: 'center' });

    const netDue = data.reconciliation.current_outstanding_balance;
    doc.setFontSize(10.5);
    doc.text(`Rs. ${netDue.toFixed(2)}`, margin + rColWidth * 3.5, valY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    doc.text(netDue > 0 ? '(Payment Due to Store)' : '(All Accounts Clear)', margin + rColWidth * 3.5, valY + 4.5, { align: 'center' });

    y += reconHeight + 6;

    // =========================================================================
    // 6. SIGNATORY & AUTHORIZATION BLOCK
    // =========================================================================
    checkPageBreak(22);

    const sigY = y + 12;
    // Customer Sign on Left
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin + 5, sigY, margin + 60, sigY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Customer's Acknowledgment & Signature", margin + 5, sigY + 4);

    // Store Authorized Sign on Right
    doc.line(pageWidth - margin - 60, sigY, pageWidth - margin - 5, sigY);
    doc.setFont('helvetica', 'bold');
    doc.text(`For ${data.shop_settings.shop_name}`, pageWidth - margin - 60, sigY - 2);
    doc.setFont('helvetica', 'normal');
    doc.text('Authorized Signatory & Stamp', pageWidth - margin - 60, sigY + 4);

    // =========================================================================
    // 7. DYNAMIC PAGINATION & FOOTER (Applies to all pages)
    // =========================================================================
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Bottom Footer Rule
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      const footerMsg = data.shop_settings.footer_message || 'Thank you for your business. For any queries regarding this statement, please contact the store.';
      doc.text(footerMsg, margin, pageHeight - 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }

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

