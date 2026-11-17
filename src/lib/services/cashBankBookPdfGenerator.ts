import { jsPDF } from 'jspdf';
import { ShopSettings } from '../types';

export interface BookEntry {
  date: string;
  ref_number: string;
  description: string;
  party_name?: string;
  inflow: number;
  outflow: number;
  running_balance: number;
}

export interface BookReportData {
  book_type: 'CASH' | 'BANK';
  shop_settings: Partial<ShopSettings>;
  period_label: string;
  opening_balance: number;
  closing_balance: number;
  entries: BookEntry[];
}

function formatRs(amount: number): string {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export class CashBankBookPdfGenerator {
  static generateBookPdf(data: BookReportData): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2; // 186mm
    let y = margin;

    const isCash = data.book_type === 'CASH';
    const bookTitle = isCash ? 'CASH BOOK LEDGER' : 'BANK & UPI BOOK LEDGER';
    const primaryColor: [number, number, number] = isCash ? [16, 185, 129] : [79, 70, 229];

    const totalInflow = data.entries.reduce((sum, e) => sum + Number(e.inflow || 0), 0);
    const totalOutflow = data.entries.reduce((sum, e) => sum + Number(e.outflow || 0), 0);

    const renderHeader = () => {
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, y, contentWidth, 2, 'F');
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(data.shop_settings.shop_name || 'SimBilling Store', margin, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(bookTitle, pageWidth - margin, y, { align: 'right' });
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);

      let addressStr = data.shop_settings.address || '';
      const metaParts: string[] = [];
      if (data.shop_settings.phone) metaParts.push(`Ph: ${data.shop_settings.phone}`);
      if (data.shop_settings.gst_number) metaParts.push(`GSTIN: ${data.shop_settings.gst_number}`);
      if (metaParts.length > 0) {
        addressStr = addressStr ? `${addressStr} | ${metaParts.join(' | ')}` : metaParts.join(' | ');
      }
      if (addressStr) {
        const addrLines = doc.splitTextToSize(addressStr, 105);
        doc.text(addrLines[0] || '', margin, y);
      }

      doc.text(`Period: ${data.period_label}`, pageWidth - margin, y, { align: 'right' });
      y += 4;
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - margin, y, { align: 'right' });
      y += 3.5;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    };

    renderHeader();

    // 3 Summary KPI Cards
    const cardGap = 3;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const cardHeight = 16;

    // Card 1: Opening Balance
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`OPENING ${isCash ? 'CASH' : 'BANK / UPI'}`, margin + 3, y + 5);
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(formatRs(data.opening_balance), margin + 3, y + 12);

    // Card 2: Total Inflow & Outflow
    const card2X = margin + cardWidth + cardGap;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('INFLOW / OUTFLOW', card2X + 3, y + 5);
    doc.setFontSize(8.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`+${formatRs(totalInflow)}`, card2X + 3, y + 10.2);
    doc.setTextColor(239, 68, 68);
    doc.text(`-${formatRs(totalOutflow)}`, card2X + 3, y + 14.2);

    // Card 3: Closing Balance
    const card3X = margin + (cardWidth + cardGap) * 2;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(card3X, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`CLOSING ${isCash ? 'CASH' : 'BANK / UPI'}`, card3X + 3, y + 5);
    doc.setFontSize(10.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(formatRs(data.closing_balance), card3X + 3, y + 12);

    y += cardHeight + 6;

    // 6-Column Layout (186mm total width, well-spaced numeric columns)
    const col = {
      date: margin + 1.5,       // 13.5..40.5 (27mm)
      ref: margin + 29,         // 41..64 (23mm)
      desc: margin + 53,        // 65..124 (59mm)
      inflowRight: margin + 136,  // right-aligned (22mm)
      outflowRight: margin + 160, // right-aligned (22mm)
      balanceRight: pageWidth - margin - 1.5 // right-aligned at 196.5 (24mm)
    };

    const renderTableHeader = () => {
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);

      doc.text('Date & Time', col.date, y + 4.8);
      doc.text('Ref #', col.ref, y + 4.8);
      doc.text('Particulars / Description', col.desc, y + 4.8);
      doc.text('Inflow (Rs.)', col.inflowRight, y + 4.8, { align: 'right' });
      doc.text('Outflow (Rs.)', col.outflowRight, y + 4.8, { align: 'right' });
      doc.text('Balance (Rs.)', col.balanceRight, y + 4.8, { align: 'right' });

      y += 7;
    };

    renderTableHeader();

    // Opening Balance Row
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('—', col.date, y + 4.4);
    doc.text('OPENING', col.ref, y + 4.4);
    doc.text('Opening Balance Brought Forward', col.desc, y + 4.4);
    doc.setTextColor(148, 163, 184);
    doc.text('—', col.inflowRight, y + 4.4, { align: 'right' });
    doc.text('—', col.outflowRight, y + 4.4, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    doc.text(formatRs(data.opening_balance), col.balanceRight, y + 4.4, { align: 'right' });
    y += 6.5;

    // Ledger Rows
    data.entries.forEach((entry, index) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      const sanitizedDesc = (entry.description || '—').replace(/₹/g, 'Rs.');
      const descLines = doc.splitTextToSize(sanitizedDesc, 58);
      const rowHeight = Math.max(6.2, descLines.length * 3.6 + 2.6);

      if (y + rowHeight > pageHeight - 20) {
        doc.addPage();
        y = margin;
        renderHeader();
        renderTableHeader();
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowHeight, 'F');
      }

      let dateDisplay = entry.date;
      try {
        const d = new Date(entry.date);
        dateDisplay = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
      } catch {
        dateDisplay = entry.date.slice(0, 16);
      }

      const textY = y + 4.1;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(dateDisplay, col.date, textY);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      const refText = doc.splitTextToSize(entry.ref_number || '—', 22)[0] || '—';
      doc.text(refText, col.ref, textY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, col.desc, textY);

      if (entry.inflow > 0) {
        doc.setTextColor(16, 185, 129);
        doc.text(`+${Number(entry.inflow).toFixed(2)}`, col.inflowRight, textY, { align: 'right' });
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', col.inflowRight, textY, { align: 'right' });
      }

      if (entry.outflow > 0) {
        doc.setTextColor(239, 68, 68);
        doc.text(`-${Number(entry.outflow).toFixed(2)}`, col.outflowRight, textY, { align: 'right' });
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', col.outflowRight, textY, { align: 'right' });
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(formatRs(entry.running_balance), col.balanceRight, textY, { align: 'right' });

      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);

      y += rowHeight;
    });

    // Final Totals Bar
    if (y + 14 > pageHeight - 20) {
      doc.addPage();
      y = margin + 8;
    }

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`TOTAL (${data.entries.length} ENTRIES) & CLOSING`, col.date, y + 5);

    doc.setTextColor(16, 185, 129);
    doc.text(`+${formatRs(totalInflow)}`, col.inflowRight, y + 5, { align: 'right' });

    doc.setTextColor(239, 68, 68);
    doc.text(`-${formatRs(totalOutflow)}`, col.outflowRight, y + 5, { align: 'right' });

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(formatRs(data.closing_balance), col.balanceRight, y + 5, { align: 'right' });

    y += 18;

    // Verification Signatures Footer
    if (y + 18 > pageHeight - 15) {
      doc.addPage();
      y = margin + 15;
    }

    const sigWidth = 55;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);

    doc.line(margin + 5, y, margin + 5 + sigWidth, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Prepared By (Cashier / Accountant)', margin + 5 + sigWidth / 2, y + 4, { align: 'center' });

    doc.line(pageWidth - margin - 5 - sigWidth, y, pageWidth - margin - 5, y);
    doc.text('Certified By (Super Admin / Auditor)', pageWidth - margin - 5 - sigWidth / 2, y + 4, { align: 'center' });

    // Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`SimBilling Certified Audit Ledger — Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    return doc;
  }
}
