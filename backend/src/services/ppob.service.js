const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const { primary, fallback } = require('../config/supplier');

class PPOBService {
  constructor(supplier) {
    this.supplier = supplier;
    this.client = axios.create({
      baseURL: supplier.baseURL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Generate signature (tiap supplier beda format)
  generateSignature(payload) {
    const { apiKey, secret } = this.supplier;
    const timestamp = Date.now();
    const raw = `${apiKey}:${timestamp}:${secret}`;
    return {
      signature: crypto.createHmac('sha256', secret).update(raw).digest('hex'),
      timestamp
    };
  }

  // 1. Ambil daftar harga dari supplier
  async syncPriceList() {
    const { signature, timestamp } = this.generateSignature({});
    
    try {
      const response = await this.client.get(this.supplier.endpoints.priceList, {
        headers: {
          'X-API-Key': this.supplier.apiKey,
          'X-Signature': signature,
          'X-Timestamp': timestamp
        }
      });

      const products = response.data.data;
      
      // Sinkronisasi ke database lokal
      for (const product of products) {
        await db.query(`
          INSERT INTO products (code, name, category, provider, base_price, selling_price)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            base_price = VALUES(base_price),
            selling_price = VALUES(base_price) * 1.02,
            updated_at = NOW()
        `, [
          product.code,
          product.name,
          product.category,
          product.provider,
          product.price,
          product.price * 1.02
        ]);
      }
      
      return { synced: products.length };
    } catch (error) {
      console.error('Sync failed:', error.message);
      throw error;
    }
  }

  // 2. Transaksi Topup (Pulsa, Data, Token, E-Money)
  async topup({ trx_id, product_code, target_number }) {
    const payload = {
      api_key: this.supplier.apiKey,
      trx_id,
      product_code,
      target_number
    };
    
    const { signature, timestamp } = this.generateSignature(payload);
    payload.signature = signature;
    payload.timestamp = timestamp;

    try {
      const response = await this.client.post(this.supplier.endpoints.topup, payload);
      
      return {
        status: this.mapStatus(response.data.rc),
        sn: response.data.sn,
        message: response.data.message,
        raw: response.data
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        return { status: 'pending', message: 'Timeout - akan dicek ulang' };
      }
      throw error;
    }
  }

  // 3. Cek Tagihan (PLN, BPJS, PDAM, dll)
  async inquiry({ product_code, target_number }) {
    const payload = {
      api_key: this.supplier.apiKey,
      product_code,
      target_number
    };
    
    const { signature } = this.generateSignature(payload);
    payload.signature = signature;

    const response = await this.client.post(this.supplier.endpoints.inquiry, payload);
    
    return {
      customer_name: response.data.customer_name,
      customer_id: response.data.customer_id,
      period: response.data.period,
      amount: parseFloat(response.data.amount),
      admin_fee: parseFloat(response.data.admin_fee || 0),
      total: parseFloat(response.data.amount) + parseFloat(response.data.admin_fee || 0),
      detail: response.data.detail
    };
  }

  // 4. Bayar Tagihan
  async payment({ trx_id, product_code, target_number, ref_id }) {
    const payload = {
      api_key: this.supplier.apiKey,
      trx_id,
      product_code,
      target_number,
      ref_id // ID inquiry sebelumnya
    };
    
    const { signature } = this.generateSignature(payload);
    payload.signature = signature;

    const response = await this.client.post(this.supplier.endpoints.payment, payload);
    
    return {
      status: this.mapStatus(response.data.rc),
      receipt: response.data.receipt,
      total: response.data.total,
      message: response.data.message
    };
  }

  // 5. Cek Status Transaksi (untuk yang pending)
  async checkStatus(trx_id) {
    const payload = {
      api_key: this.supplier.apiKey,
      trx_id
    };
    
    const { signature } = this.generateSignature(payload);
    payload.signature = signature;

    const response = await this.client.post(this.supplier.endpoints.status, payload);
    
    return {
      status: this.mapStatus(response.data.rc),
      sn: response.data.sn,
      message: response.data.message
    };
  }

  // 6. Cek Saldo Supplier
  async checkBalance() {
    const { signature } = this.generateSignature({});
    const response = await this.client.get(this.supplier.endpoints.balance, {
      headers: {
        'X-API-Key': this.supplier.apiKey,
        'X-Signature': signature
      }
    });
    return response.data.balance;
  }

  // Mapping status code supplier ke status internal
  mapStatus(rc) {
    const statusMap = {
      '00': 'success',
      '01': 'pending',
      '02': 'failed',
      '03': 'failed', // Invalid product
      '04': 'failed', // Invalid number
      '05': 'failed', // Insufficient balance
      '10': 'failed'  // System error
    };
    return statusMap[rc] || 'pending';
  }
}

// Export instance dengan supplier primary
module.exports = new PPOBService(primary);

// Fallback service
module.exports.fallback = new PPOBService(fallback);
