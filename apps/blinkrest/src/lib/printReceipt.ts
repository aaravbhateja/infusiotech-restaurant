import * as Print from 'expo-print';
import { Platform } from 'react-native';

// expo-print's web implementation ignores the `html` option entirely and
// just calls window.print() on whatever page is currently open — so on
// web, printAsync({ html: receipt }) would silently print the Table Detail
// screen itself, not the receipt. Opening the receipt in its own window and
// printing that instead is the standard workaround; native platforms use
// the real printAsync, which does respect `html`.
export async function printHtml(html: string) {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) throw new Error('Pop-up blocked — allow pop-ups for this site to print.');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    return;
  }
  await Print.printAsync({ html });
}

export type ReceiptItem = { name: string; quantity: number; lineTotalMinor: number };

export function buildReceiptHtml(opts: {
  tenantName: string;
  tenantAddress?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  tableLabel?: string | null;
  orderNumber: string;
  createdAt: string;
  items: ReceiptItem[];
  subtotalMinor: number;
  gstPercent: number;
  gstMinor: number;
  totalMinor: number;
  copyNumber?: number;
}) {
  const money = (minor: number) => `₹${(minor / 100).toFixed(2)}`;
  const metaLine = [
    `Bill #${opts.orderNumber}`,
    opts.tableLabel,
    new Date(opts.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }),
    new Date(opts.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
  ]
    .filter(Boolean)
    .join(' · ');
  const rows = opts.items
    .map(
      (i) => `
    <tr>
      <td style="padding:3px 0;">${escapeHtml(i.name)} × ${i.quantity}</td>
      <td style="padding:3px 0; text-align:right;">${money(i.lineTotalMinor)}</td>
    </tr>`,
    )
    .join('');

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Bill #${escapeHtml(opts.orderNumber)}</title>
<style>
  body { font-family: 'Courier New', Courier, monospace; color: #1B1716; width: 320px; margin: 0 auto; padding: 20px; font-size: 13px; }
  .name-box { border: 1.5px solid #81AFE7; padding: 8px; text-align: center; }
  .name-box span { font-weight: bold; letter-spacing: 1px; font-size: 15px; }
  .muted { color: #4A4240; font-size: 11px; text-align: center; margin: 6px 0 0; }
  .line { border-top: 1px dashed #D9D3D0; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .total-row td { font-weight: bold; font-size: 14px; padding-top: 8px; border-top: 1px dashed #D9D3D0; }
  .dup { text-align: center; font-weight: bold; letter-spacing: 1px; border: 1.5px solid #1B1716; padding: 4px; margin-bottom: 8px; }
  .footer { text-align: center; font-size: 11px; color: #4A4240; margin-top: 16px; }
  .footer b.blink { color: #1B1716; }
  .footer b.rest { color: #FF5A36; }
  @media print { body { width: auto; } }
</style>
</head>
<body>
  ${opts.copyNumber && opts.copyNumber > 1 ? `<div class="dup">DUPLICATE COPY #${opts.copyNumber}</div>` : ''}
  <div class="name-box"><span>${escapeHtml(opts.tenantName.toUpperCase())}</span></div>
  <p class="muted">
    ${[opts.tenantAddress, opts.gstin ? `GSTIN ${opts.gstin}` : null].filter((s): s is string => !!s).map(escapeHtml).join(' · ')}
  </p>
  ${opts.fssai ? `<p class="muted">FSSAI ${escapeHtml(opts.fssai)}</p>` : ''}
  <div class="line"></div>
  <p class="muted" style="margin:0; text-align:left;">${escapeHtml(metaLine)}</p>
  <div class="line"></div>
  <table>
    ${rows}
  </table>
  <div class="line"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right;">${money(opts.subtotalMinor)}</td></tr>
    <tr><td>GST (${opts.gstPercent}%)</td><td style="text-align:right;">${money(opts.gstMinor)}</td></tr>
    <tr class="total-row"><td>TOTAL</td><td style="text-align:right;">${money(opts.totalMinor)}</td></tr>
  </table>
  <div class="line"></div>
  <p class="footer">Powered by ⚡ <b class="blink">Blink</b><b class="rest">Rest</b></p>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
