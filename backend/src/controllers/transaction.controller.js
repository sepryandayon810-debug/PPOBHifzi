const db = require('../config/database');
const PPOBService = require('../services/ppob.service');
const { v4: uuidv4 } = require('uuid');

exports.createTransaction = async (req, res) => {
  const { product_code, target_number, pin } = req.body;
  const user_id = req.user.id;
  
  try {
    // Validasi PIN & Saldo
    const [user] = await db.query('SELECT saldo, pin FROM users WHERE id = ?', [user_id]);
    if (user[0].pin !== pin) return res.status(400).json({ message: 'PIN salah' });
    
    // Ambil data produk
    const [product] = await db.query('SELECT * FROM products WHERE code = ?', [product_code]);
    if (!product.length) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    
    const harga = product[0].price;
    if (user[0].saldo < harga) return res.status(400).json({ message: 'Saldo tidak cukup' });
    
    // Generate ID transaksi
    const trx_id = `TRX-${Date.now()}-${uuidv4().substr(0, 4)}`;
    
    // Potong saldo (pessimistic locking)
    await db.query('UPDATE users SET saldo = saldo - ? WHERE id = ?', [harga, user_id]);
    
    // Simpan transaksi pending
    await db.query(
      `INSERT INTO transactions (id, user_id, product_code, target_number, amount, status, created_at) 
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [trx_id, user_id, product_code, target_number, harga]
    );
    
    // Hit API Supplier
    const result = await PPOBService.topup({
      trx_id,
      product_code,
      target_number
    });
    
    // Update status berdasarkan response supplier
    const status = result.status === 'success' ? 'success' : 'failed';
    await db.query(
      'UPDATE transactions SET status = ?, sn = ?, response_data = ? WHERE id = ?',
      [status, result.sn || null, JSON.stringify(result), trx_id]
    );
    
    // Jika gagal, refund saldo
    if (status === 'failed') {
      await db.query('UPDATE users SET saldo = saldo + ? WHERE id = ?', [harga, user_id]);
    }
    
    // Hitung komisi downline jika ada
    await calculateCommission(user_id, harga, trx_id);
    
    res.json({
      success: true,
      data: {
        trx_id,
        status,
        sn: result.sn,
        message: result.message
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

exports.checkBill = async (req, res) => {
  const { product_code, target_number } = req.body;
  
  try {
    const result = await PPOBService.inquiry({
      product_code,
      target_number
    });
    
    res.json({
      success: true,
      data: {
        customer_name: result.customer_name,
        period: result.period,
        amount: result.amount,
        admin_fee: result.admin_fee,
        total: result.amount + result.admin_fee
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal cek tagihan' });
  }
};
