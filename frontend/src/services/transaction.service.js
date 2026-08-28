import api from './api';

export const transactionService = {
  create: (data) => api.post('/transactions', data),
  checkBill: (data) => api.post('/transactions/check-bill', data),
  getHistory: (params) => api.get('/transactions/history', { params }),
  getReport: (params) => api.get('/transactions/report', { params }),
  
  // Print struk thermal
  printReceipt: (trxId) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head><title>Struk ${trxId}</title>
        <style>
          body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 10px; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
        </style></head>
        <body>
          <div class="center">
            <h3>PPOB MASTER</h3>
            <p>Jl. Merdeka No. 1</p>
          </div>
          <div class="line"></div>
          <p>ID: ${trxId}</p>
          <div class="line"></div>
          <p style="text-align:center;">Terima Kasih</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
};
