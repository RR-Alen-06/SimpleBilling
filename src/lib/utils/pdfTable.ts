import { jsPDF } from 'jspdf';

export interface SimplePdfTableColumn {
  header: string;
  x: number;
  maxWidth: number;
  align?: 'left' | 'right';
}

export interface SimplePdfTableOptions {
  title: string;
  subtitle: string;
  summaryLine: string;
  headerFill: [number, number, number];
  columns: SimplePdfTableColumn[];
  rows: string[][];
}

/**
 * Generates a clean, paginated A4 PDF table using pure jsPDF.
 */
export function buildSimplePdfTable(options: SimplePdfTableOptions): jsPDF {
  const { title, subtitle, summaryLine, headerFill, columns, rows } = options;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, margin, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(summaryLine, margin, 28);

  let y = 34;

  const drawHeader = () => {
    doc.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    columns.forEach(col => {
      doc.text(col.header, col.x, y + 4.8, { align: col.align || 'left' });
    });
    y += 9;
  };

  drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  rows.forEach((row, idx) => {
    if (y > pageHeight - 16) {
      doc.addPage();
      y = 16;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 4, contentWidth, 6.2, 'F');
    }

    doc.setTextColor(30, 41, 59);
    columns.forEach((col, cIdx) => {
      const val = row[cIdx] ?? '';
      const clipped = doc.splitTextToSize(val, col.maxWidth)[0] || '';
      doc.text(clipped, col.x, y, { align: col.align || 'left' });
    });
    y += 6.2;
  });

  return doc;
}
