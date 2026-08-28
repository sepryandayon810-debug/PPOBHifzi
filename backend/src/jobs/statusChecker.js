const cron = require('node-cron');
const db = require('../config/database');
const ppobService = require('../services/ppob.service');

// Jalankan setiap 5 menit
cron.schedule('*/5 * * * *', async () => {
  console.log('[CRON] Checking pending transactions...');
  
  try {
    // Ambil transaksi pending yang lebih dari 2 menit
    const [pending] = await db.query(`
      SELECT id, product_code, target_number 
      FROM transactions 
      WHERE status = 'pending' 
      AND created_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
      AND retry_count < 5
    `);
    
    for (const trx of pending) {
      try {
        const result = await ppobService.checkStatus(trx.id);
        
        await db.query(
          'UPDATE transactions SET status = ?, sn = ?, retry_count = retry_count + 1, updated_at = NOW() WHERE id = ?',
          [result.status, result.sn, trx.id]
        );
        
        // Jika gagal, refund saldo
        if (result.status === 'failed') {
          await db.query(`
            UPDATE users u 
            JOIN transactions t ON t.user_id = u.id 
            SET u.saldo = u.saldo + t.amount 
            WHERE t.id = ?
          `, [trx.id]);
        }
        
        console.log(`[CRON] Updated ${trx.id} -> ${result.status}`);
      } catch (err) {
        console.error(`[CRON] Failed check ${trx.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[CRON] Error:', error);
  }
});
