import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, AlertCircle, Phone, Loader2, Wifi, ArrowRight, X, Smartphone, Globe, Package } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js';

import { useCountries } from '../hooks/useCountries'; 
import { useOperators } from '../hooks/useOperators';
import { formatPhoneNumber, extractDigits, validatePhoneNumber, type PhoneValidationResult } from '../../../shared/phoneValidator'; 
import { filterCountries, type Country } from '../shared/countryValidator'; 
import { rechargeApi, type Product } from '../services/api';
import PaymentModal from './PaymentModal';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [txnResult, setTxnResult] = useState<any>(null);
  
  const [logoError, setLogoError] = useState(false);
  const [activeTab, setActiveTab] = useState<'AIRTIME' | 'DATA' | 'BUNDLES'>('AIRTIME');
  const [customAmount, setCustomAmount] = useState('');
  
  const [showManualSelection, setShowManualSelection] = useState(false);

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [pendingTxn, setPendingTxn] = useState<{product: Product, amount: number} | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const { countries, loading: countriesLoading, error: countriesError, usingFallback } = useCountries();
  
  const { operators: availableOperators, usingFallback: operatorsOffline } = useOperators(selectedCountry?.iso3);

  const filteredCountries = useMemo(() => {
    return filterCountries(countries || [], searchQuery || '');
  }, [searchQuery, countries]);

  const categorizedProducts = useMemo(() => {
    return {
      AIRTIME: products.filter(p => p.subserviceId === 11 || !p.subserviceId),
      DATA: products.filter(p => p.subserviceId === 12),
      BUNDLES: products.filter(p => p.subserviceId === 13),
    };
  }, [products]);

  const rangedProduct = useMemo(() => {
    return categorizedProducts.AIRTIME.find(p => p.type === 'RANGED_VALUE_RECHARGE');
  }, [categorizedProducts.AIRTIME]);

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
    if (!operator) return;
    setLoading(true);
    setApiError('');
    try {
      const prodData = await rechargeApi.getProducts(operator.operatorId);
      setProducts(prodData);
      setStep(2);
    } catch (err: any) {
      setApiError('Could not load products. Server may be offline.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (product: Product, amount?: number) => {
    let finalAmount = amount || 0;
    
    if (product.type !== 'RANGED_VALUE_RECHARGE') {
      const priceString = product.amount.split(' ')[0]; 
      finalAmount = parseFloat(priceString);
    } else {
      if (!finalAmount || finalAmount < product.min || finalAmount > product.max) {
        setApiError(`Amount must be between ${product.min} and ${product.max}`);
        return;
      }
    }

    setPendingTxn({ product, amount: finalAmount });
    setIsPayModalOpen(true);
  };

  // ✅ FIX: Updated to handle immediate backend failure
  const executeTransaction = async (paymentId: string) => {
    if (!pendingTxn) return;
    
    setIsPayModalOpen(false); 
    setLoading(true); 

    try {
      const result = await rechargeApi.purchase(
        pendingTxn.product.id, 
        validationState?.fullNumber || '', 
        pendingTxn.amount,
        pendingTxn.product.currency,
        paymentId
      );

     // ✅ ROBUST CHECK: Fail if success is false OR status is suspicious
    if (
      result.success === false || 
      !result.id || 
      result.status === 'DECLINED' || 
      result.status === 'REJECTED'
    ) {
      throw new Error(result.status || 'Transaction Failed');
    }
      setTxnResult(result);
      setStep(3); 
    } catch (err: any) {
      setApiError(err.message || "Transaction failed. A refund has been issued.");
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setPhoneNumber('');
    setValidationState(null);
    setApiError('');
    setOperator(null);
    setProducts([]);
    setCustomAmount('');
    setShowManualSelection(false);
  };

  if (countriesLoading) return <div className="text-center p-10"><Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" /><p className="mt-4 text-gray-600">Loading countries list...</p></div>;
  if (countriesError && !usingFallback && countries.length === 0) return <div className="text-center p-10 text-red-600">{countriesError}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 h-fit">
        
        <div className="bg-indigo-600 p-6 text-white relative">
          {(usingFallback || operatorsOffline) && (
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
          {apiError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-100">
              <AlertCircle className="w-4 h-4" />
              {apiError}
            </div>
          )}

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
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 flex justify-center items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <>Confirm & View Plans <ArrowRight className="w-4 h-4" /></>}
                </button>
                <button onClick={() => setStep(1)} className="w-full text-gray-500 py-2 hover:text-gray-700 text-sm font-medium">Incorrect Operator? Go Back</button>
              </div>
            </div>
          )}

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

              <div className="flex bg-gray-100 p-1 rounded-lg">
                {(['AIRTIME', 'DATA', 'BUNDLES'] as const).map(tab => (
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

              <div className="min-h-[250px]">
                {activeTab === 'AIRTIME' && (
                  <div className="space-y-4">
                    {rangedProduct && (
                      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <label className="block text-xs font-bold text-indigo-700 uppercase mb-2">Custom Amount</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder={`${rangedProduct.min} - ${rangedProduct.max}`}
                            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <button 
                            onClick={() => handlePurchase(rangedProduct, parseFloat(customAmount))}
                            disabled={!customAmount}
                            className="bg-indigo-600 text-white px-4 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Pay
                          </button>
                        </div>
                        <p className="text-xs text-indigo-400 mt-1">
                          Range: {rangedProduct.min} - {rangedProduct.max} {rangedProduct.currency}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      {categorizedProducts.AIRTIME.filter(p => p.type !== 'RANGED_VALUE_RECHARGE').length > 0 && 
                        <p className="text-xs text-gray-400 font-bold uppercase mt-2">Fixed Amounts</p>
                      }
                      
                      <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
                        {categorizedProducts.AIRTIME.filter(p => p.type !== 'RANGED_VALUE_RECHARGE').map(p => (
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

                      {!rangedProduct && categorizedProducts.AIRTIME.length === 0 && (
                        <div className="text-center py-10 text-gray-400">No airtime plans found.</div>
                      )}
                    </div>
                  </div>
                )}

                {(activeTab === 'DATA' || activeTab === 'BUNDLES') && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {categorizedProducts[activeTab].length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        No {activeTab.toLowerCase()} plans found.
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
                <div className="flex justify-between"><span>Status:</span> <span className="font-bold">{txnResult.status.message || txnResult.status}</span></div>
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
               onClose={() => setIsPayModalOpen(false)}
               amount={pendingTxn.amount > 0 ? pendingTxn.amount : parseFloat(pendingTxn.product.amount.split(' ')[0] || '0')}
               currency={pendingTxn.product.currency}
               onSuccess={executeTransaction}
             />
          )}

        </div>
      </div>
    </div>
  );
}
