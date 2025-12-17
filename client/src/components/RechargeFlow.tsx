import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, AlertCircle, Phone, Loader2, ArrowRight, X, Smartphone, Globe, Package, DollarSign, Wifi } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js';

import { useCountries } from '../hooks/useCountries';
import { useOperators } from '../hooks/useOperators';
import { useProducts } from '../hooks/useProducts';
import { formatPhoneNumber, extractDigits, validatePhoneNumber, type PhoneValidationResult } from '../../../shared/phoneValidator';
import { filterCountries, type Country } from '../shared/countryValidator';
import { rechargeApi, type Product } from '../services/api';
import PaymentModal from './PaymentModal';

// Margin used ONLY for rough UI estimates. Real price comes from Server.
const ESTIMATED_MARGIN = 1.15;

export default function RechargeFlow() {
  const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [validationState, setValidationState] = useState<PhoneValidationResult | null>(null);
  
  // Data State
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [operator, setOperator] = useState<any>(null);
  const [txnResult, setTxnResult] = useState<any>(null);
  
  const [logoError, setLogoError] = useState(false);
  const [activeTab, setActiveTab] = useState<'AIRTIME' | 'DATA' | 'BUNDLES'>('AIRTIME');
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [operatorSearch, setOperatorSearch] = useState('');
  
  // Modals
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  // ✅ SERVER-SIDE PRICE STORAGE
  const [pendingPurchase, setPendingPurchase] = useState<{
    product: Product;
    mobile: string;
    customAmount?: number;
    clientSecret?: string;
    serverPrice?: {
      usdPrice: number;
      localAmount: number;
      currency: string;
      breakdown: any;
    };
  } | null>(null);
  
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);

  // Filters
  const [currency, setCurrency] = useState(''); 
  const [priceFilter, setPriceFilter] = useState<number | 'ALL'>('ALL'); 

  // Custom Amount
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customAmountError, setCustomAmountError] = useState<string | null>(null);
  const [selectedRangedProduct, setSelectedRangedProduct] = useState<Product | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { countries, loading: countriesLoading, error: countriesError, usingFallback } = useCountries();
  const { operators: availableOperators, usingFallback: operatorsFallback } = useOperators(selectedCountry?.iso3);
  const { products: allProducts, loading: productsLoading } = useProducts(operator?.operatorId, '', undefined);

  // 1. Compute Available Currencies
  const availableCurrencies = useMemo(() => {
    if (!allProducts.length) return [];
    const currencies = new Set(allProducts.map(p => p.currency));
    return Array.from(currencies).sort(); 
  }, [allProducts]);

  useEffect(() => {
    if (availableCurrencies.length > 0) {
      if (!currency || !availableCurrencies.includes(currency)) {
        if (availableCurrencies.includes('USD')) setCurrency('USD');
        else setCurrency(''); 
      }
    }
  }, [availableCurrencies, currency]);

  // 2. Filter Products
  const { fixedProducts, rangedProducts } = useMemo(() => {
    const rawFixed = allProducts.filter(p => !p.type?.includes('RANGED'));
    const rawRanged = allProducts.filter(p => p.type?.includes('RANGED'));

    let fixed = rawFixed;
    if (currency) {
      fixed = fixed.filter(p => p.currency === currency);
    }
    
    // Rough estimate filter
    if (priceFilter !== 'ALL') {
      fixed = fixed.filter(p => {
        const cost = p.costPrice || parseFloat(p.amount);
        const estimatedUsd = cost * ESTIMATED_MARGIN;
        return Math.abs(estimatedUsd - priceFilter) <= 3;
      });
    }
    
    return { fixedProducts: fixed, rangedProducts: rawRanged };
  }, [allProducts, currency, priceFilter]);

  // 3. Categorize
  const categorizedProducts = useMemo(() => {
    return {
      // Mobile (1) -> Airtime (11)
      AIRTIME: fixedProducts.filter(p => p.serviceId === 1 && p.subserviceId === 11),
      
      // Mobile (1) -> Bundles (12)
      BUNDLES: fixedProducts.filter(p => p.serviceId === 1 && p.subserviceId === 12),
      
      // Mobile (1) -> Data (13)
      DATA: fixedProducts.filter(p => p.serviceId === 1 && p.subserviceId === 13),

      // Future Proofing:
      // GIFT_CARDS: fixedProducts.filter(p => p.serviceId === 4),
      // UTILITIES: fixedProducts.filter(p => p.serviceId === 3),
    };
  }, [fixedProducts]);

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

  const filteredOperators = useMemo(() => {
    if (!operatorSearch) return availableOperators;
    return availableOperators.filter(op =>
      op.name.toLowerCase().includes(operatorSearch.toLowerCase())
    );
  }, [availableOperators, operatorSearch]);

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

  // ==========================================
  // HANDLERS (Previously Truncated - Restored)
  // ==========================================

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
    setShowCustomAmount(false);
    setCustomAmount('');
    setCustomAmountError(null);
    setSelectedRangedProduct(null);
  };

  const resetFlow = () => {
    setStep(1);
    setPhoneNumber('');
    setValidationState(null);
    setApiError('');
    setOperator(null);
    setShowManualSelection(false);
    setPriceFilter('ALL');
    setShowCustomAmount(false);
    setCustomAmount('');
    setCustomAmountError(null);
    setSelectedRangedProduct(null);
    setPendingPurchase(null);
  };

  // ==========================================
  // PURCHASE HANDLERS (Server-Side Price)
  // ==========================================

  const handlePurchase = async (product: Product, customAmountValue?: number) => {
    setLoading(true);
    setApiError('');
    
    try {
      const priceResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          mobile: validationState?.fullNumber || '',
          type: product.type,
          customAmount: customAmountValue
        })
      });

      if (!priceResponse.ok) {
        const error = await priceResponse.json();
        throw new Error(error.error || 'Failed to calculate price');
      }

      const priceData = await priceResponse.json();

      setPendingPurchase({
        product,
        mobile: validationState?.fullNumber || '',
        customAmount: customAmountValue,
        clientSecret: priceData.clientSecret,
        serverPrice: {
          usdPrice: priceData.chargeAmount,
          localAmount: priceData.localAmount,
          currency: priceData.currency,
          breakdown: priceData.breakdown
        }
      });

      setIsConfirmModalOpen(true);

    } catch (error: any) {
      setApiError(error.message || 'Failed to prepare purchase');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPurchase = () => {
    setIsConfirmModalOpen(false);
    setIsPayModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsPayModalOpen(false);
    setApiError('');
    setPendingPurchase(null);
    setIsProcessingTransaction(false);
  };

  const executeTransaction = async (paymentId: string) => {
    if (!pendingPurchase) return;
    
    setIsProcessingTransaction(true);
    setApiError('');

    try {
      let result = await rechargeApi.purchase(
        pendingPurchase.product.id,
        pendingPurchase.mobile,
        pendingPurchase.customAmount || parseFloat(pendingPurchase.product.amount),
        pendingPurchase.serverPrice?.currency || 'USD',
        pendingPurchase.product.type,
        paymentId
      );

      if (result.success && result.dbStatus === 'PENDING') {
        const MAX_RETRIES = 15;
        let retries = 0;
        while (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const statusUpdate = await rechargeApi.checkStatus(paymentId);
            if (statusUpdate.status === 'COMPLETED') {
              result = { ...result, success: true, dbStatus: 'COMPLETED', ...statusUpdate };
              break;
            }
            if (['FAILED', 'REFUNDED'].includes(statusUpdate.status)) {
              result = { ...result, success: false, dbStatus: statusUpdate.status, refunded: statusUpdate.status === 'REFUNDED' };
              break;
            }
          } catch (pollErr) { console.warn("Polling error", pollErr); }
          retries++;
        }
      }

      if (!result.success) {
        const errorMsg = result.refunded 
          ? `Transaction failed. Your payment has been refunded automatically.`
          : `Transaction failed: ${result.message || result.error || 'Unknown error'}`;
        setApiError(errorMsg);
        setIsProcessingTransaction(false);
        return;
      }

      setTxnResult(result);
      setIsProcessingTransaction(false);
      setPendingPurchase(null);
      setApiError('');
      
      setTimeout(() => {
        setIsPayModalOpen(false);
        setStep(3);
      }, 100);
      
    } catch (err: any) {
      console.error("Transaction Error:", err);
      setApiError(err.message || 'Transaction failed. Please try again.');
      setIsProcessingTransaction(false);
    }
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    if (selectedRangedProduct && value) {
      const val = parseFloat(value);
      if (val < (selectedRangedProduct.min || 0)) {
        setCustomAmountError(`Minimum amount is ${selectedRangedProduct.min}`);
      } else if (val > (selectedRangedProduct.max || Infinity)) {
        setCustomAmountError(`Maximum amount is ${selectedRangedProduct.max}`);
      } else {
        setCustomAmountError(null);
      }
    } else {
      setCustomAmountError(null);
    }
  };

  const handleCustomAmountPurchase = () => {
    if (!selectedRangedProduct || !customAmount || customAmountError) return;
    const amount = parseFloat(customAmount);
    if (isNaN(amount)) return;
    handlePurchase(selectedRangedProduct, amount);
  };

  if (countriesLoading) return <div className="text-center p-10"><Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" /><p className="mt-4 text-gray-600">Loading countries list...</p></div>;
  if (countriesError && !usingFallback && countries.length === 0) return <div className="text-center p-10 text-red-600">{countriesError}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10 safe-bottom">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 h-fit">
        
        {/* HEADER */}
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

          {/* STEP 1: Country & Phone */}
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
                    placeholder="Search country..."
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
                  <input
                    type="text"
                    placeholder="Search operators..."
                    value={operatorSearch}
                    onChange={(e) => setOperatorSearch(e.target.value)}
                    className="w-full mb-3 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto scrollbar-hide">
                    {filteredOperators.map((op) => (
                      <button
                        key={op.id}
                        onClick={() => handleManualSelect(op)}
                        className="p-4 border rounded-lg hover:border-indigo-500 hover:bg-indigo-50 text-left text-sm font-medium text-gray-700"
                      >
                        {op.name}
                      </button>
                    ))}
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

          {/* STEP 1.5: Confirm Operator */}
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
                    <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mb-2">
                      <span className="text-white font-bold text-2xl">{operator.operatorName.charAt(0)}</span>
                    </div>
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

          {/* STEP 2: Select Product */}
          {step === 2 && operator && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{operator.operatorName}</span>
                </div>
                <button onClick={resetFlow} className="text-sm text-blue-600 underline">Change</button>
              </div>

              {/* Filters */}
              <div className="flex gap-2 mb-2">
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)} 
                  className="border p-3 rounded-lg text-base flex-1 bg-white min-h-[48px]"
                  disabled={availableCurrencies.length <= 1} 
                >
                  <option value="">All Currencies</option>
                  {availableCurrencies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Tabs */}
              {visibleTabs.length > 0 && (
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  {visibleTabs.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-3 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-1 min-h-[48px] ${
                        activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab === 'AIRTIME' && <Smartphone className="w-4 h-4" />}
                      {tab === 'DATA' && <Globe className="w-4 h-4" />}
                      {tab === 'BUNDLES' && <Package className="w-4 h-4" />}
                      <span>{tab.charAt(0) + tab.slice(1).toLowerCase()}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Products Grid */}
              <div className="min-h-[250px]">
                {productsLoading ? (
                    <div className="flex justify-center items-center h-40 text-gray-500 gap-2">
                        <Loader2 className="animate-spin w-5 h-5"/> Loading products...
                    </div>
                ) : (
                <>
                {/* Custom Amount for Airtime */}
                {activeTab === 'AIRTIME' && rangedProducts.length > 0 && (
                  <div className="border-b pb-4 mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-indigo-500" /> Custom Amount
                    </h4>
                    
                    {!showCustomAmount ? (
                      <button
                        onClick={() => {
                          setSelectedRangedProduct(rangedProducts[0]);
                          setShowCustomAmount(true);
                          setCustomAmount('');
                          setCustomAmountError(null);
                        }}
                        className="w-full p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-gray-600"
                      >
                        <span className="text-xl font-light">+</span>
                        <span>Enter Custom Amount</span>
                      </button>
                    ) : (
                      <div className="p-4 rounded-xl border-2 border-indigo-300 bg-indigo-50/50">
                         <div className="text-sm text-gray-600 mb-3">
                              Range: <span className="font-medium">{selectedRangedProduct?.min} - {selectedRangedProduct?.max} {selectedRangedProduct?.currency}</span>
                         </div>
                         <div className="flex gap-3">
                              <div className="w-full relative">
                                <input
                                    type="number"
                                    value={customAmount}
                                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                                    placeholder="Amount"
                                    className={`w-full px-4 py-3 rounded-lg border-2 focus:outline-none ${customAmountError ? 'border-red-300 focus:border-red-500' : 'focus:border-indigo-500'}`}
                                />
                              </div>
                              <button
                                onClick={handleCustomAmountPurchase}
                                disabled={!customAmount || !!customAmountError}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Buy
                              </button>
                         </div>
                         {customAmountError && (
                           <div className="text-red-500 text-xs mt-1.5 ml-1 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {customAmountError}
                           </div>
                         )}
                         <button onClick={() => setShowCustomAmount(false)} className="mt-3 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Fixed Products */}
                {categorizedProducts[activeTab].length > 0 ? (
                  <div className={`grid ${activeTab === 'AIRTIME' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'} gap-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide`}>
                    {categorizedProducts[activeTab].map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => handlePurchase(p)} 
                        className={`flex ${activeTab === 'AIRTIME' ? 'flex-col items-center justify-center text-center' : 'justify-between items-center text-left'} p-4 border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 active:scale-[0.98] transition-all bg-white group touch-target`}
                      >
                        <div>
                          <span className="font-bold text-gray-800 group-hover:text-indigo-700 block">
                             {p.name || p.amount}
                          </span>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide group-hover:text-indigo-400">
                             {p.currency}
                          </span>
                        </div>
                        {/* Rough Estimate for UI only */}
                        <span className="text-[11px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full mt-1">
                           ~${((p.costPrice || parseFloat(p.amount)) * ESTIMATED_MARGIN).toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-600 font-medium mb-1">No plans found</p>
                  </div>
                )}
                </>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Success */}
          {step === 3 && txnResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Success!</h2>
              <div className="bg-gray-50 p-4 rounded-lg text-left text-sm space-y-2 mb-6">
                <div className="flex justify-between"><span>Status:</span> <span className="font-bold">{txnResult.status || 'COMPLETED'}</span></div>
                <div className="flex justify-between"><span>ID:</span> <span className="font-mono">{txnResult.id}</span></div>
                <div className="flex justify-between"><span>Mobile:</span> <span className="font-mono">{validationState?.fullNumber}</span></div>
              </div>
              <button onClick={resetFlow} className="w-full bg-gray-900 text-white py-3 rounded-lg font-bold">Send Another</button>
            </div>
          )}

          {/* CONFIRMATION MODAL (Server Price) */}
          {pendingPurchase && (
            <div className={`fixed inset-0 z-50 ${isConfirmModalOpen ? 'flex' : 'hidden'} items-center justify-center p-4 bg-black/60 backdrop-blur-sm`}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-xl mb-4 text-gray-900">Confirm Purchase</h3>
                
                <div className="space-y-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="text-gray-500 text-sm">Recipient Gets</span>
                      <span className="font-bold text-gray-900 text-lg">
                        {pendingPurchase.serverPrice?.localAmount} {pendingPurchase.serverPrice?.currency}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-indigo-600 font-medium">You Pay</span>
                      <span className="font-bold text-indigo-700 text-xl">
                        ${pendingPurchase.serverPrice?.usdPrice.toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400 text-center">
                    Sending to <span className="font-mono text-gray-600">{pendingPurchase.mobile}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmPurchase}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PAYMENT MODAL */}
          {pendingPurchase && isPayModalOpen && (
             <PaymentModal
               isOpen={isPayModalOpen}
               onClose={handleCloseModal} 
               clientSecret={pendingPurchase.clientSecret}
               amount={pendingPurchase.serverPrice?.usdPrice || 0}
               currency="USD"
               onSuccess={executeTransaction} 
               mobile={pendingPurchase.mobile}
               productId={pendingPurchase.product.id}
               productType={pendingPurchase.product.type}
               transactionError={apiError} 
               isProcessingTransaction={isProcessingTransaction}
               onClearError={() => setApiError('')} 
             />
          )}

        </div>
      </div>
    </div>
  );
}
