const axios = require('axios');
const crypto = require('crypto');

class PPOBService {
  constructor() {
    this.baseURL = process.env.SUPPLIER_URL;
    this.apiKey = process.env.SUPPLIER_API_KEY;
    this.secretKey = process.env.SUPPLIER_SECRET;
  }
  
  generateSignature(payload) {
    const stringToSign = JSON.stringify(payload) + this.secretKey;
    return crypto.createHmac('sha256', this.secretKey).update(stringToSign).digest('hex');
  }
  
  async topup({ trx_id, product_code, target_number }) {
    const payload = {
      api_key: this.apiKey,
      trx_id,
      product_code,
      target_number,
      timestamp: Date.now()
    };
    
    payload.signature = this.generateSignature(payload);
    
    try {
      const response = await axios.post(`${this.baseURL}/topup`, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return {
        status: response.data.status === '00' ? 'success' : 'failed',
        sn: response.data.sn,
        message: response.data.message
      };
    } catch (error) {
      // Jika timeout, biarkan pending - akan dicek oleh background job
      return { status: 'pending', message: 'Sedang diproses' };
    }
  }
  
  async inquiry({ product_code, target_number }) {
    const payload = {
      api_key: this.apiKey,
      product_code,
      target_number,
      timestamp: Date.now()
    };
    
    payload.signature = this.generateSignature(payload);
    
    const response = await axios.post(`${this.baseURL}/inquiry`, payload);
    return response.data;
  }
  
  async checkStatus(trx_id) {
    // Dipanggil oleh background job untuk cek transaksi pending
    const response = await axios.post(`${this.baseURL}/status`, {
      api_key: this.apiKey,
      trx_id
    });
    return response.data;
  }
}

module.exports = new PPOBService();
