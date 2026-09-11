import * as XLSX from 'xlsx';

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'Data') {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (err) {
    console.error('Export excel error:', err);
  }
}

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Export CSV error:', err);
  }
}

export function buildPrintHtml(innerHTML: string, customTitle = 'Cetak Dokumen') {
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((s) => s.outerHTML)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${customTitle}</title>
    ${styles}
    <style>
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      body {
        background-color: #ffffff !important;
        color: #000000 !important;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: block;
      }
      @media print {
        .no-print {
          display: none !important;
        }
      }
      /* Ensure any element marked hidden in the app appears when printed */
      .hidden {
        display: block !important;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-page-wrapper {
        max-width: 820px;
        margin: 0 auto;
        padding: 16px 14px;
        background: white;
      }
    </style>
    <script>
      function triggerPrint() {
        window.print();
      }
      window.addEventListener('load', function() {
        setTimeout(function() {
          try {
            window.print();
          } catch(e) {
            console.warn('Auto print failed:', e);
          }
        }, 300);
      });
    </script>
  </head>
  <body>
    <div class="no-print" style="position: sticky; top: 0; z-index: 9999; background: #0f172a; color: white; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; font-family: sans-serif; font-size: 13px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="background: #2563eb; color: white; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">DOKUMEN RESMI</span>
        <span style="font-weight: 600;">${customTitle}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px;">
          🖨️ Cetak / Simpan PDF
        </button>
        <button onclick="window.close()" style="background: #334155; color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;">
          ✕ Tutup
        </button>
      </div>
    </div>
    <div class="print-page-wrapper">
      ${innerHTML}
    </div>
  </body>
</html>`;
}

export function openPrintWindow(elementId: string, customTitle = 'Cetak Dokumen') {
  const elem = document.getElementById(elementId);
  if (!elem) {
    window.print();
    return;
  }

  const fullHtml = buildPrintHtml(elem.innerHTML, customTitle);
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  // Attempt to open in a new tab or window
  const newWin = window.open(blobUrl, '_blank');
  if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
    // If popup was blocked by browser, trigger download or link navigation
    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.download = `${customTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function printElement(elementId: string, customTitle = 'Cetak Dokumen') {
  const elem = document.getElementById(elementId);
  if (!elem) {
    window.print();
    return;
  }

  // Create or reuse hidden print iframe for completely isolated, crisp printing
  try {
    let printIframe = document.getElementById('__app_print_frame__') as HTMLIFrameElement | null;
    if (printIframe) {
      printIframe.remove();
    }
    printIframe = document.createElement('iframe');
    printIframe.id = '__app_print_frame__';
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    printIframe.style.zIndex = '-9999';
    printIframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printIframe);

    const frameDoc = printIframe.contentWindow?.document || printIframe.contentDocument;
    if (frameDoc && printIframe.contentWindow) {
      const fullHtml = buildPrintHtml(elem.innerHTML, customTitle);
      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();

      setTimeout(() => {
        try {
          printIframe?.contentWindow?.focus();
          printIframe?.contentWindow?.print();
        } catch (iframeErr) {
          console.warn('Iframe print error, falling back to openPrintWindow:', iframeErr);
          openPrintWindow(elementId, customTitle);
        }
      }, 350);
      return;
    }
  } catch (err) {
    console.warn('Error creating print iframe, falling back:', err);
  }

  // Fallback to openPrintWindow
  openPrintWindow(elementId, customTitle);
}
