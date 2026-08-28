const db = require('../config/database');
const crypto = require('crypto');

exports.handleCallback = async (req, res) => {
  // Verifikasi signature dari supplier
  const signature = req.headers['x-callback-signature'];
  const payload = JSON.stringify(req.body);
  const expectedSig = crypto.createHmac('sha256', process.env.SUPPLIER_SECRET).update(payload).digest('hex');
  
  if (signature !== expectedSig) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  const { trx_id, status, sn, message } = req.body;
  
  try {
    // Update transaksi
    await db.query(
      'UPDATE transactions SET status = ?, sn = ?, updated_at = NOW() WHERE id = ?',
      [status, sn, trx_id]
    );
    
    // Jika gagal, refund
    if (status === 'failed') {
      await db.query(`
        UPDATE users u 
        JOIN transactions t ON t.user_id = u.id 
        SET u.saldo = u.saldo + t.amount 
        WHERE t.id = ?
      `, [trx_id]);
    }
    
    // Kirim notifikasi WhatsApp ke user
    // await whatsappService.sendReceipt(trx_id);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};
