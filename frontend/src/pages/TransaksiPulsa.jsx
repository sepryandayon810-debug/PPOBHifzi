import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { transactionService } from '../services/transaction.service';
import PaymentModal from '../components/Transaction/PaymentModal';
import Receipt from '../components/Transaction/Receipt';

export default function TransaksiPulsa() {
  const [phone, setPhone] = useState('');
  const [nominal, setNominal] = useState('');
  const [operator, setOperator] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const detectOperator = (num) => {
    const prefix = num.substring(0, 4);
    if (['0811','0812','0813','0821','0822','0852','0853'].includes(prefix)) return 'Telkomsel';
    if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return 'Indosat';
    if (['0817','0818','0819','0859','0877','0878'].includes(prefix)) return 'XL';
    if (['0895','0896','0897','0898','0899'].includes(prefix)) return 'Three';
    return 'Unknown';
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setPhone(val);
    setOperator(detectOperator(val));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await transactionService.create({
        product_code: `PULSA-${operator}-${nominal}`,
        target_number: phone,
        pin: prompt('Masukkan PIN:')
      });
      
      if (res.success) {
        setResult(res.data);
        setShowConfirm(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Transaksi gagal');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Pulsa & Paket Data</h1>
      
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Nomor HP</label>
          <input
            type="text"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="08xxxxxxxxxx"
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          {operator && operator !== 'Unknown' && (
            <p className="text-sm text-green-600 mt-1">✓ Terdeteksi: {operator}</p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Nominal</label>
          <div className="grid grid-cols-2 gap-3">
            {[5000, 10000, 20000, 50000, 100000].map((n) => (
              <button
                key={n}
                onClick={() => setNominal(n)}
                className={`p-4 border rounded-lg text-center transition ${
                  nominal === n ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-400'
                }`}
              >
                <div className="font-semibold">Rp {n.toLocaleString()}</div>
                <div className="text-xs text-gray-500">Harga: Rp {(n * 1.02).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!phone || !nominal || loading}
          className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Lanjutkan'}
        </button>
      </div>

      {showConfirm && (
        <PaymentModal
          product={`Pulsa ${operator} ${nominal}`}
          target={phone}
          price={nominal * 1.02}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {result && <Receipt data={result} />}
    </div>
  );
}
