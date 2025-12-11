import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, AlertCircle, Phone, Loader2, Wifi, ArrowRight, X, Smartphone, Globe, Package } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js';

import { useCountries } from '../hooks/useCountries'; 
import { useOperators } from '../hooks/useOperators';
import { useProducts } from '../hooks/useProducts'; 
import { formatPhoneNumber, extractDigits, validatePhoneNumber, type PhoneValidationResult } from '../../../shared/phoneValidator'; 
import { filterCountries, type Country } from '../shared/countryValidator'; 
import { rechargeApi, type Product } from '../services/api';
import PaymentModal from './PaymentModal';

// ✅ $5 Minimum Limit for USD products
const MIN_USD_AMOUNT = 5;

// Helper to filter out small USD products
const isProductEligible = (p: Product) => {
  if (p.currency !== 'USD') return true; 
  const price = parseFloat(p.amount.split(' ')[0]);
  return price >= MIN_USD_AMOUNT;
};

export default function RechargeFlow() {
  const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [validationState, setValidationState] = useState<PhoneValidationResult | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [operator, setOperator] = useState<any>(null);
  const [txnResult, setTxnResult] = useState<any>(null);
  
  const [logoError, setLogoError] = useState(false);
  const [activeTab, setActiveTab] = useState<'AIRTIME' | 'DATA' | 'BUNDLES'>('AIRTIME');
  
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [pendingTxn, setPendingTxn] = useState<{product: Product, amount: number, mobile: string} | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false); // ✅ Added state

  // FILTERS
  const [currency, setCurrency] = useState(''); 
  const [priceFilter, setPriceFilter] = useState<number | 'ALL'>('ALL'); 

  const dropdownRef = useRef<HTMLDivElement>(null);
  const { countries, loading: countriesLoading, error: countriesError, usingFallback } = useCountries();
  
  const { operators: availableOperators, usingFallback: operatorsFallback } = useOperators(selectedCountry?.iso3);

  // Fetch All Products
  const { products: allProducts, loading: productsLoading } = useProducts(
    operator?.operatorId, 
    '', 
    undefined 
  );

  // Dynamic Currencies
  const availableCurrencies = useMemo(() => {
    if (!allProducts.length) return [];
    const currencies = new Set(allProducts.map(p => p.currency));
    return Array.from(currencies).sort(); 
  }, [allProducts]);

  // SMART AUTO-SELECT CURRENCY
  useEffect(() => {
    if (availableCurrencies.length > 0) {
      if (!currency || !availableCurrencies.includes(currency)) {
        if (availableCurrencies.includes('USD')) {
          setCurrency('USD');
        } else {
          setCurrency(''); 
        }
      }
    }
  }, [availableCurrencies, currency]);

  // FILTER LOGIC
  const filteredProducts = useMemo(() => {
    let list = allProducts;

    list = list.filter(p => !p.type.includes('RANGED'));

    if (currency) {
      list = list.filter(p => p.currency === currency);
    }

    list = list.filter(isProductEligible);

    if (priceFilter !== 'ALL') {
      list = list.filter(p => {
        const price = parseFloat(p.amount.split(' ')[0]);
        return Math.abs(price - priceFilter) <= 1.5; 
      });
    }

    return list;
  }, [allProducts, currency, priceFilter]);

  // Categorize for Tabs
  const categorizedProducts = useMemo(() => {
    return {
      AIRTIME: filteredProducts.filter(p => p.subserviceId !== 12 && p.subserviceId !== 13),
      DATA: filteredProducts.filter(p => p.subserviceId === 12),
      BUNDLES: filteredProducts.filter(p => p.subserviceId === 13),
    };
  }, [filteredProducts]);

  // Dynamic Tabs
  const visibleTabs = useMemo(() => {
    const tabs: ('AIRTIME' | 'DATA' | 'BUNDLES')[] = [];
    if (categorizedProducts.AIRTIME.length > 0) tabs.push('AIRTIME');
    if (categorizedProducts.DATA.length > 0) tabs.push('DATA');
    if (categorizedProducts.BUNDLES.length > 0) tabs.push('BUNDLES');
    return tabs;
  }, [categorizedProducts]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  const filteredCountries = useMemo(() => {
    return filterCountries(countries || [], searchQuery || '');
  }, [searchQuery, countries]);

  const operatorCountryName = useMemo(() => {
    if (!operator || !countries.length) return operator?.countryIso || 'Unknown';
    const found = countries.find(c => c.code === operator.countryIso || c.iso3 === operator.countryIso);
    return found ? found.name : operator.countryIso;
  }, [operator, countries]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (operator) setLogoError(false);
  }, [operator]);

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setSearchQuery(country.name);
    setShowDropdown(false);
    setPhoneNumber('');
    setValidationState(null);
    setApiError('');
    setShowManualSelection(false);
  };

  const handleClearCountry = () => {
    setSelectedCountry(null);
    setSearchQuery('');
    setPhoneNumber('');
    setValidationState(null);
    setShowManualSelection(false);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCountry) return;
    setApiError('');
    const code = selectedCountry.code as CountryCode;
    const rawValue = e.target.value;
    const isDeleting = rawValue.length < phoneNumber.length;
    const formatted = isDeleting ? rawValue : formatPhoneNumber(rawValue, code);
    setPhoneNumber(formatted);
    const digits = extractDigits(formatted);
    const validation = validatePhoneNumber(digits, code);
    setValidationState(validation);
  };

  const handleLookupOperator = async () => {
    if (!selectedCountry || !validationState?.valid) return;
    setLoading(true);
    setApiError('');
    setShowManualSelection(false);

    try {
      const fullMobile = validationState.fullNumber || `+${extractDigits(phoneNumber)}`;
      const opData = await rechargeApi.lookup(fullMobile);
      setOperator(opData);
      setStep(1.5); 
    } catch (err: any) {
      console.error(err);
      setApiError('Auto-detection failed. Please select an operator below.');
      setShowManualSelection(true);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSelect = (op: any) => {
    setOperator({
      operatorId: op.id,
      operatorName: op.name,
      countryIso: selectedCountry?.code || '',
      identified: true
    });
    setStep(1.5);
    setShowManualSelection(false);
    setApiError('');
  };

  const handleConfirmOperator = async () => {
    setStep(2);
  };

  const handlePurchase = async (product: Product) => {
    if (isPurchasing) return;
    setIsPurchasing(true);

    const priceString = product.amount.split(' ')[0]; 
    const finalAmount = parseFloat(priceString);

    const effectiveMin = product.currency === 'USD' ? Math.max(product.min, MIN_USD_AMOUNT) : product.min;
    if (finalAmount < effectiveMin) {
        setApiError(`Minimum purchase is ${effectiveMin} ${product.currency}`);
        setIsPurchasing(false);
        return;
    }

    setPendingTxn({ product, amount: finalAmount, mobile: validationState?.fullNumber || ''  });
    setApiError(''); // Clear errors
    setIsPayModalOpen(true);
    setIsPurchasing(false); 
  };

  // ✅ UPDATED: Clean Logic - Handles backend state & errors properly
  const executeTransaction = async (paymentId: string) => {
    if (!pendingTxn) return;
    
    // ✅ Set processing state to show loading indicator in Modal
    setIsProcessingTransaction(true);
    setApiError(''); // Clear any previous errors

    try {
      const result = await rechargeApi.purchase(
        pendingTxn.product.id,       
        pendingTxn.mobile,           
        pendingTxn.amount,           
        pendingTxn.product.currency, 
        pendingTxn.product.type,     
        paymentId                    
      );

      if (!result.success || result.dbStatus === 'FAILED' || result.dbStatus === 'REFUNDED') {
        const errorMsg = result.refunded 
          ? `Transaction failed. Your payment has been refunded automatically.`
          : `Transaction failed: ${result.message || result.error || 'Unknown error'}`;
        
        // ✅ Set Error and stop processing, but KEEP MODAL OPEN so user sees the error
        setApiError(errorMsg);
        setIsProcessingTransaction(false);
        return; 
      }

      // ✅ Success case
      setTxnResult(result);
      setIsPayModalOpen(false); // Close Modal
      setIsProcessingTransaction(false);
      setStep(3); 
      
    } catch (err: any) {
      console.error("Transaction Error:", err);
      // ✅ Set Error and stop processing, but KEEP MODAL OPEN
      setApiError(err.message || 'Transaction failed. Please try again.');
      setIsProcessingTransaction(false);
    }
  };

  // ✅ Added proper close handler
  const handleCloseModal = () => {
    setIsPayModalOpen(false);
    setApiError('');
    setPendingTxn(null);
    setIsProcessingTransaction(false);
  };

  const resetFlow = () => {
    setStep(1);
    setPhoneNumber('');
    setValidationState(null);
    setApiError('');
    setOperator(null);
    setShowManualSelection(false);
    setPriceFilter('ALL'); 
  };

  if (countriesLoading) return <div className="text-center p-10"><Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" /><p className="mt-4 text-gray-600">Loading countries list...</p></div>;
  if (countriesError && !usingFallback && countries.length === 0) return <div className="text-center p-10 text-red-600">{countriesError}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 h-fit">
        
        <div className="bg-indigo-600 p-6 text-white relative">
          {(usingFallback || operatorsFallback) && (
            <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <Wifi className="w-3 h-3" /> OFFLINE
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6" />
            <h1 className="text-xl font-bold">Mobile Recharge</h1>
          </div>
          <p className="text-indigo-200 text-sm mt-1">Global Top-up Service</p>
        </div>

        <div className="p-6">
          {apiError && !isPayModalOpen && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-100">
              <AlertCircle className="w-4 h-4" />
              {apiError}
            </div>
          )}

          {/* STEP 1: COUNTRY & PHONE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                <div className="relative">
                  {selectedCountry ? (
                    <div className="absolute left-3 top-3 z-10 flex items-center justify-center w-6 h-6">
                      <ReactCountryFlag countryCode={selectedCountry.code} svg style={{ width: '1.5em', height: '1.5em', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  )}

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search country (e.g. USA, Ghana)..."
                    className={`w-full pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${selectedCountry ? 'pl-12' : 'pl-10'}`}
                  />
                  {selectedCountry && (
                    <button onClick={handleClearCountry} className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {showDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredCountries.map(c => (
                      <button
                        key={c.code}
                        onClick={() => handleCountrySelect(c)}
                        className="w-full px-4 py-2 text-left hover:bg-indigo-50 flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <ReactCountryFlag countryCode={c.code} svg /> {c.name}
                        </span>
                        <span className="text-gray-400 text-sm font-mono">{c.iso3}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                <div className="flex gap-3">
                  <div className="flex items-center justify-center px-4 bg-gray-100 border rounded-lg font-mono text-gray-600 min-w-[4rem]">
                    {selectedCountry ? selectedCountry.dialCode : '+--'}
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    disabled={!selectedCountry}
                    placeholder="Mobile Number"
                    className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                </div>
                {validationState && (
                  <div className={`mt-2 text-sm flex items-center gap-1 ${validationState.valid ? 'text-green-600' : 'text-red-500'}`}>
                    {validationState.valid ? <Check className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                    {validationState.message}
                  </div>
                )}
              </div>

              {!showManualSelection && (
                 <button onClick={handleLookupOperator} disabled={loading || !validationState?.valid} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex justify-center gap-2">
                   {loading ? <Loader2 className="animate-spin" /> : 'Continue'}
                 </button>
              )}

              {showManualSelection && selectedCountry && (
                <div className="mt-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">Select Operator:</p>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {availableOperators.length === 0 ? (
                       <div className="col-span-2 text-center text-sm text-gray-400 py-4">No operators found for this country.</div>
                    ) : (
                      availableOperators.map((op) => (
                        <button
                          key={op.id}
                          onClick={() => handleManualSelect(op)}
                          className="p-3 border rounded-lg hover:border-indigo-500 hover:bg-indigo-50 text-left text-sm font-medium text-gray-700 transition-colors"
                        >
                          {op.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              {!showManualSelection && selectedCountry && (
                <div className="text-center mt-2">
                  <button onClick={() => setShowManualSelection(true)} className="text-xs text-indigo-500 hover:underline">
                    Select operator manually
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 1.5: CONFIRM OPERATOR */}
          {step === 1.5 && operator && (
            <div className="space-y-6 text-center">
              <div className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-100">
                <p className="text-sm text-indigo-600 font-semibold uppercase tracking-wider mb-4">Operator Detected</p>
                <div className="flex flex-col items-center justify-center gap-3">
                  {!logoError ? (
                    <img 
                      src={`https://operator-logo.dtone.com/logo-${operator.operatorId}-3.png`}
                      alt={operator.operatorName}
                      className="h-16 w-auto object-contain mb-2"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <Wifi className="w-12 h-12 text-indigo-600 mb-2" />
                  )}
                  <div className="text-2xl font-bold text-gray-900">{operator.operatorName}</div>
                </div>
                <div className="mt-2 text-gray-500 text-sm font-medium">
                  Country: <span className="font-bold text-gray-700">{operatorCountryName}</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleConfirmOperator}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 flex justify-center items-center gap-2"
                >
                  Confirm & View Plans <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={() => setStep(1)} className="w-full text-gray-500 py-2 hover:text-gray-700 text-sm font-medium">Incorrect Operator? Go Back</button>
              </div>
            </div>
          )}

          {/* STEP 2: SELECT PRODUCT */}
          {step === 2 && operator && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-2">
                  {!logoError ? (
                    <img 
                      src={`https://operator-logo.dtone.com/logo-${operator.operatorId}-1.png`} 
                      alt="" 
                      className="w-6 h-6 object-contain"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <Wifi className="w-5 h-5 text-indigo-600" />
                  )}
                  <span className="font-bold text-gray-900">{operator.operatorName}</span>
                </div>
                <button onClick={resetFlow} className="text-sm text-blue-600 underline">Change</button>
              </div>

              {/* QUICK PRICE FILTERS */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                  onClick={() => setPriceFilter('ALL')} 
                  className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${priceFilter === 'ALL' ? 'bg-black text-white border-black' : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'}`}
                >
                  All
                </button>
                {[5, 10, 15, 20, 25, 50].map(amt => (
                  <button 
                    key={amt}
                    onClick={() => setPriceFilter(amt)}
                    className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${priceFilter === amt ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* CURRENCY DROPDOWN */}
              <div className="flex gap-2 mb-2">
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)} 
                  className="border p-2 rounded-lg text-sm flex-1 bg-white"
                  disabled={availableCurrencies.length <= 1} 
                >
                  <option value="">All Currencies</option>
                  {availableCurrencies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* CATEGORY TABS (Hidden if empty) */}
              {visibleTabs.length > 0 && (
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  {visibleTabs.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${
                        activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab === 'AIRTIME' && <Smartphone className="w-4 h-4 inline mr-1 mb-0.5" />}
                      {tab === 'DATA' && <Globe className="w-4 h-4 inline mr-1 mb-0.5" />}
                      {tab === 'BUNDLES' && <Package className="w-4 h-4 inline mr-1 mb-0.5" />}
                      {tab.charAt(0) + tab.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              )}

              <div className="min-h-[250px]">
                {productsLoading ? (
                    <div className="flex justify-center items-center h-40 text-gray-500 gap-2">
                        <Loader2 className="animate-spin w-5 h-5"/> Loading products...
                    </div>
                ) : (
                <>
                {activeTab === 'AIRTIME' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {categorizedProducts.AIRTIME.map(p => (
                        <button 
                          key={p.id} 
                          onClick={() => handlePurchase(p)} 
                          className="flex flex-col items-center justify-center p-2 border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 hover:shadow-sm transition-all h-20 bg-white group"
                        >
                          <span className="font-bold text-gray-800 text-lg group-hover:text-indigo-700">
                            {p.amount.split(' ')[0]}
                          </span>
                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide group-hover:text-indigo-400">
                            {p.currency}
                          </span>
                        </button>
                      ))}
                    </div>

                    {categorizedProducts.AIRTIME.length === 0 && (
                      <div className="text-center py-10 text-gray-400">
                        {priceFilter !== 'ALL' ? `No fixed plans found for ~$${priceFilter}.` : 'No airtime plans available.'}
                      </div>
                    )}
                  </div>
                )}

                {(activeTab === 'DATA' || activeTab === 'BUNDLES') && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {categorizedProducts[activeTab].length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        No plans found.
                      </div>
                    ) : (
                      categorizedProducts[activeTab].map(p => (
                        <div key={p.id} onClick={() => handlePurchase(p)} className="group p-4 border rounded-xl hover:border-indigo-500 cursor-pointer bg-white transition-all hover:shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-gray-800">{p.name}</div>
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description || p.amount}</div>
                            </div>
                            <div className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold whitespace-nowrap group-hover:bg-indigo-100 group-hover:text-indigo-700">
                              {p.amount}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
                </>
                )}
              </div>
            </div>
          )}

          {step === 3 && txnResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Success!</h2>
              <p className="text-gray-500 mb-6">Top-up sent successfully.</p>
              
              <div className="bg-gray-50 p-4 rounded-lg text-left text-sm space-y-2 mb-6">
                <div className="flex justify-between"><span>Status:</span> <span className="font-bold">{txnResult.status || 'COMPLETED'}</span></div>
                <div className="flex justify-between"><span>ID:</span> <span className="font-mono">{txnResult.id}</span></div>
                <div className="flex justify-between"><span>Mobile:</span> <span className="font-mono">{validationState?.fullNumber}</span></div>
              </div>

              <button onClick={resetFlow} className="w-full bg-gray-900 text-white py-3 rounded-lg font-bold">
                Send Another
              </button>
            </div>
          )}

          {pendingTxn && isPayModalOpen && (
             <PaymentModal
               isOpen={isPayModalOpen}
               onClose={handleCloseModal} // ✅ Updated Close Handler
               amount={pendingTxn.amount > 0 ? pendingTxn.amount : parseFloat(pendingTxn.product.amount.split(' ')[0] || '0')}
               currency={pendingTxn.product.currency}
               onSuccess={executeTransaction} 
               mobile={pendingTxn.mobile}
               productId={pendingTxn.product.id}
               productType={pendingTxn.product.type}
               transactionError={apiError} // ✅ Pass error
               isProcessingTransaction={isProcessingTransaction} // ✅ Pass backend state
             />
          )}

        </div>
      </div>
    </div>
  );
}
