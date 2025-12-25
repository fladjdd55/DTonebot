import { useState, useMemo, useEffect } from 'react';
import { Smartphone, Globe, Package, Loader2, DollarSign } from 'lucide-react';

interface Props {
  products: any[];
  loading: boolean;
  onPurchase: (product: any, customAmount?: number) => void;
  onChangeOperator: () => void;
  operatorName: string;
}

const ESTIMATED_MARGIN = 1.15; // Move to config if possible

export default function ProductStep({ products, loading, onPurchase, onChangeOperator, operatorName }: Props) {
  const [activeTab, setActiveTab] = useState<'AIRTIME' | 'DATA' | 'BUNDLES'>('AIRTIME');
  const [currency, setCurrency] = useState('');
  
  // Custom Amount State
  const [customAmount, setCustomAmount] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // 1. Get Currencies
  const currencies = useMemo(() => {
    return Array.from(new Set(products.map(p => p.currency))).sort();
  }, [products]);

  // 2. Categorize & Filter
  const { categorized, rangedProducts } = useMemo(() => {
    let filtered = products;
    if (currency) filtered = products.filter(p => p.currency === currency);

    const ranged = filtered.filter(p => p.type?.includes('RANGED'));
    
    return {
      categorized: {
        AIRTIME: filtered.filter(p => !p.type?.includes('RANGED') && p.serviceId === 1 && p.subserviceId === 11),
        BUNDLES: filtered.filter(p => p.serviceId === 1 && p.subserviceId === 12),
        DATA: filtered.filter(p => p.serviceId === 1 && p.subserviceId === 13),
      },
      rangedProducts: ranged
    };
  }, [products, currency]);

  // 3. Auto-select Tab
  useEffect(() => {
    if (categorized.AIRTIME.length) setActiveTab('AIRTIME');
    else if (categorized.DATA.length) setActiveTab('DATA');
    else if (categorized.BUNDLES.length) setActiveTab('BUNDLES');
  }, [products]);

  const handleCustomSubmit = () => {
    if (!customAmount || customError) return;
    onPurchase(rangedProducts[0], parseFloat(customAmount));
  };

  const handleCustomChange = (val: string) => {
    setCustomAmount(val);
    const p = rangedProducts[0];
    if (!p) return;
    const num = parseFloat(val);
    if (num < (p.min || 0)) setCustomError(`Min: ${p.min}`);
    else if (num > (p.max || Infinity)) setCustomError(`Max: ${p.max}`);
    else setCustomError(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-4">
        <span className="font-bold text-gray-900 text-lg">{operatorName}</span>
        <button onClick={onChangeOperator} className="text-sm text-indigo-600 font-medium hover:underline">Change</button>
      </div>

      {/* Currency Filter */}
      {currencies.length > 1 && (
        <select 
          value={currency} onChange={(e) => setCurrency(e.target.value)}
          className="w-full border p-3 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">All Currencies</option>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-lg">
        {['AIRTIME', 'DATA', 'BUNDLES'].map((tab: any) => (
           <button
             key={tab}
             onClick={() => setActiveTab(tab)}
             disabled={!categorized[tab as keyof typeof categorized].length && !(tab === 'AIRTIME' && rangedProducts.length)}
             className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-md flex items-center justify-center gap-1 sm:gap-2 transition-all ${
               activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500'
             }`}
           >
             {tab === 'AIRTIME' && <Smartphone className="w-4 h-4" />}
             {tab === 'DATA' && <Globe className="w-4 h-4" />}
             {tab === 'BUNDLES' && <Package className="w-4 h-4" />}
             {tab}
           </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[250px]">
        {loading ? (
           <div className="flex justify-center items-center h-40 gap-2 text-gray-500">
             <Loader2 className="animate-spin" /> Loading products...
           </div>
        ) : (
          <>
            {/* Custom Amount Section */}
            {activeTab === 'AIRTIME' && rangedProducts.length > 0 && (
              <div className="mb-4 p-4 border border-indigo-100 rounded-xl bg-indigo-50/50">
                <div className="flex justify-between items-center mb-3">
                   <h4 className="font-bold text-gray-700 flex items-center gap-2">
                     <DollarSign className="w-4 h-4 text-indigo-500" /> Custom Amount
                   </h4>
                   <span className="text-xs text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-100 font-medium">
                     {rangedProducts[0].min} - {rangedProducts[0].max} {rangedProducts[0].currency}
                   </span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={customAmount}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    placeholder="Enter amount"
                    className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${customError ? 'border-red-300 ring-red-100' : 'border-gray-300 focus:ring-indigo-100 focus:border-indigo-500'}`}
                  />
                  <button 
                    onClick={handleCustomSubmit}
                    disabled={!!customError || !customAmount}
                    className="bg-indigo-600 text-white px-6 rounded-lg font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                  >
                    Pay
                  </button>
                </div>
                {customError && <p className="text-red-500 text-xs mt-1.5 font-medium ml-1">{customError}</p>}
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
              {categorized[activeTab].map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => onPurchase(p)}
                  className="p-3 border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 text-center group transition-all active:scale-[0.98] bg-white"
                >
                  <span className="block font-bold text-gray-800 group-hover:text-indigo-700 mb-1">{p.name || p.amount}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{p.currency}</span>
                  <div className="mt-2 text-xs text-indigo-600 font-bold bg-indigo-50 rounded-md px-2 py-1 inline-block border border-indigo-100">
                     ~${((parseFloat(p.amount) || 0) * ESTIMATED_MARGIN).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
            
            {categorized[activeTab].length === 0 && !rangedProducts.length && (
              <div className="text-center py-10">
                <p className="text-gray-400 font-medium">No products available.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
