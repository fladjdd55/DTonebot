// src/components/RechargeForm.tsx
import { useState, useMemo } from 'react';
import { rechargeApi } from '../services/api';
import { useProducts } from '../hooks/useProducts'; // ✅ Use the Hook

export default function RechargeForm() {
  // State
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState(1); // 1=Lookup, 2=Select, 3=Result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Filters
  const [currency, setCurrency] = useState(''); // Default: All Currencies
  const [showRanged, setShowRanged] = useState(false);

  // Data
  const [operator, setOperator] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // 1. ✅ FETCH ALL PRODUCTS (Pass '' to get everything)
  // We fetch everything first so we know what currencies exist
  const { products: allProducts, loading: productsLoading } = useProducts(
    operator?.operatorId, 
    '', 
    showRanged // Note: You might want to fetch all types and filter locally too, but this works
  );

  // 2. ✅ COMPUTE AVAILABLE CURRENCIES DYNAMICALLY
  const availableCurrencies = useMemo(() => {
    if (!allProducts.length) return [];
    const currencies = new Set(allProducts.map(p => p.currency));
    return Array.from(currencies).sort(); 
  }, [allProducts]);

  // 3. ✅ FILTER PRODUCTS FOR DISPLAY
  const displayedProducts = useMemo(() => {
    let list = allProducts;

    // Filter by Currency
    if (currency) {
      list = list.filter(p => p.currency === currency);
    }

    // Filter by Ranged (Custom Amount)
    if (showRanged) {
      list = list.filter(p => p.type.includes('RANGED'));
    } else {
      // Optional: Hide ranged products if toggle is off? 
      // Usually users want to see fixed amounts by default.
      list = list.filter(p => !p.type.includes('RANGED'));
    }

    return list;
  }, [allProducts, currency, showRanged]);

  // STEP 1: Handle Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Identify Operator
      const opData = await rechargeApi.lookup(mobile);
      setOperator(opData);
      setStep(2); // Move to next screen
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Handle Purchase
  const handleBuy = async (product: any) => {
    let amount = 0;

    // Logic for Ranged vs Fixed amount
    if (product.type.includes('RANGED')) {
      const input = prompt(`Enter amount between ${product.min} - ${product.max}:`);
      if (!input) return;
      amount = parseFloat(input);
      
      if (isNaN(amount) || amount < product.min || amount > product.max) {
          alert(`Invalid amount. Must be between ${product.min} and ${product.max}`);
          return;
      }
    }

    if (!confirm(`Confirm purchase for ${mobile}?`)) return;

    setLoading(true);
    try {
      const txn = await rechargeApi.purchase(
        product.id, 
        mobile, 
        amount, 
        product.currency, 
        product.type
      );
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

          {/* 🎚️ FILTERS */}
          <div className="flex gap-2">
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="border p-2 rounded text-sm flex-1 bg-white"
              disabled={availableCurrencies.length <= 1} // Disable if only 1 currency
            >
              <option value="">All Currencies</option>
              {availableCurrencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <button 
              onClick={() => setShowRanged(!showRanged)}
              className={`px-3 py-1 text-sm rounded border ${
                showRanged ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-white text-gray-600'
              }`}
            >
              {showRanged ? 'Custom Amount' : 'Fixed Plans'}
            </button>
          </div>
          
          {/* PRODUCT LIST */}
          <div className="h-64 overflow-y-auto space-y-2 border-t pt-2">
            {productsLoading ? (
               <p className="text-center text-gray-500 py-4">Loading products...</p>
            ) : displayedProducts.length === 0 ? (
               <div className="text-center py-4">
                 <p className="text-gray-500">No products found.</p>
                 <p className="text-xs text-gray-400 mt-1">Try changing the currency filter.</p>
               </div>
            ) : (
              displayedProducts.map(p => (
                <div key={p.id} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-500">
                        {p.type.includes('RANGED') 
                          ? `Range: ${p.min}-${p.max} ${p.currency}` 
                          : p.amount}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleBuy(p)}
                    disabled={loading}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Buy
                  </button>
                </div>
              ))
            )}
          </div>
          
          <button onClick={() => setStep(1)} className="text-gray-500 text-sm underline">
            Change Number
          </button>
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
