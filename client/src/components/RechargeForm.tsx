// src/components/RechargeForm.tsx
import { useState } from 'react';
import { rechargeApi } from '../services/api';

export default function RechargeForm() {
  // State
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState(1); // 1=Lookup, 2=Select, 3=Result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Data
  const [operator, setOperator] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  // STEP 1: Handle Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // A. Identify Operator
      const opData = await rechargeApi.lookup(mobile);
      setOperator(opData);
      
      // B. Fetch Products immediately
      const prodData = await rechargeApi.getProducts(opData.operatorId);
      setProducts(prodData);
      
      setStep(2); // Move to next screen
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Handle Purchase
  const handleBuy = async (product: any) => {
    // Logic for Ranged vs Fixed amount
    let amount = 0;
    if (product.type === 'RANGED_VALUE_RECHARGE') {
      const input = prompt(`Enter amount between ${product.min} - ${product.max}:`);
      if (!input) return;
      amount = parseFloat(input);
    }

    if (!confirm(`Confirm purchase for ${mobile}?`)) return;

    setLoading(true);
    try {
      const txn = await rechargeApi.purchase(product.id, mobile, amount);
      setResult(txn);
      setStep(3); // Move to success screen
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Mobile Recharge</h2>
      
      {/* ERROR MESSAGE */}
      {error && <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>}

      {/* VIEW 1: ENTER PHONE */}
      {step === 1 && (
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input 
              type="text" 
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder="+6595123100"
              className="mt-1 block w-full p-2 border rounded-md"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Identifying...' : 'Next'}
          </button>
        </form>
      )}

      {/* VIEW 2: SELECT PRODUCT */}
      {step === 2 && operator && (
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded">
            <p className="font-semibold text-green-700">✅ {operator.operatorName}</p>
            <p className="text-sm text-gray-500">{operator.countryIso}</p>
          </div>
          
          <div className="h-64 overflow-y-auto space-y-2 border-t pt-2">
            {products.length === 0 ? <p>No products found.</p> : products.map(p => (
              <div key={p.id} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-gray-500">{p.amount}</div>
                </div>
                <button 
                  onClick={() => handleBuy(p)}
                  disabled={loading}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setStep(1)} className="text-gray-500 text-sm underline">Change Number</button>
        </div>
      )}

      {/* VIEW 3: SUCCESS */}
      {step === 3 && result && (
        <div className="text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h3 className="text-lg font-bold text-green-600">Recharge Successful!</h3>
          <div className="bg-gray-100 p-4 rounded text-left text-sm space-y-2">
            <p><strong>Status:</strong> {result.status?.message || result.status}</p>
            <p><strong>Txn ID:</strong> {result.id}</p>
            <p><strong>Mobile:</strong> {mobile}</p>
          </div>
          <button 
            onClick={() => { setStep(1); setMobile(''); setResult(null); }}
            className="w-full bg-gray-800 text-white p-2 rounded"
          >
            Send Another
          </button>
        </div>
      )}
    </div>
  );
}
