import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, AlertCircle, Phone, Loader2, Wifi, CreditCard, Globe } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js';

// Import the hook to fetch data asynchronously
import { useCountries } from '../hooks/useCountries'; 
// Import validator logic (now accepts dynamic list as argument)
import { filterCountries, validatePhoneNumber, formatPhoneNumber, extractDigits, type PhoneValidationResult } from '../validators/phoneValidator'; 
import { rechargeApi } from '../services/api';
// Assuming Country type is defined globally or imported elsewhere if not in phoneValidator

export default function RechargeFlow() {
  // --- STATE ---
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Data State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<any>(null); // Use 'any' for now to simplify
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [validationState, setValidationState] = useState<PhoneValidationResult | null>(null);
  
  // API Data State
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [operator, setOperator] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [txnResult, setTxnResult] = useState<any>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- FIX: USE ASYNCHRONOUS DATA ---
  const { countries, loading: countriesLoading, error: countriesError } = useCountries();

  // Filter countries based on the LIVE array
  const filteredCountries = useMemo(() => {
    // Pass the currently loaded country array to the filter function
    return filterCountries(countries, searchQuery);
  }, [searchQuery, countries]);


  // --- HANDLERS: UI ---
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCountrySelect = (country: any) => {
    setSelectedCountry(country);
    setSearchQuery(country.name);
    setShowDropdown(false);
    setPhoneNumber('');
    setValidationState(null);
    setApiError('');
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

  // FLOW STEP 3 & 4: Lookup & Get Products
  const handleLookupAndFetch = async () => {
    if (!selectedCountry || !validationState?.valid) return;

    setLoading(true);
    setApiError('');

    try {
      const fullMobile = validationState.fullNumber || `+${extractDigits(phoneNumber)}`;

      // 1. API Call: Account Lookup (Flow Step 4)
      const opData = await rechargeApi.lookup(fullMobile);
      setOperator(opData);

      // 2. API Call: Get Products (Flow Step 5)
      const prodData = await rechargeApi.getProducts(opData.operatorId);
      setProducts(prodData);

      setStep(2); // Move to Plans View

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Failed to identify operator');
    } finally {
      setLoading(false);
    }
  };

  // FLOW STEP 5: Purchase
  const handlePurchase = async (product: any) => {
    let amountToSend = 0;

    if (product.type === 'RANGED_VALUE_RECHARGE') {
      const input = prompt(`Enter amount (${product.min} - ${product.max} ${product.currency})`);
      if (!input) return;
      amountToSend = parseFloat(input);
      if (amountToSend < product.min || amountToSend > product.max) {
        alert('Invalid amount');
        return;
      }
    }

    if (!confirm(`Send to ${validationState?.fullNumber}?`)) return;

    setLoading(true);
    try {
      const result = await rechargeApi.purchase(
        product.id, 
        validationState?.fullNumber || '', 
        amountToSend
      );
      setTxnResult(result);
      setStep(3); // Success Screen
    } catch (err: any) {
      setApiError(err.message);
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
  };

  // --- RENDER ---
  
  if (countriesLoading) {
    return <div className="text-center p-10"><Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" /><p className="mt-4 text-gray-600">Loading countries...</p></div>;
  }
  if (countriesError) {
    return <div className="text-center p-10 text-red-600"><AlertCircle className="w-8 h-8 mx-auto" /><p className="mt-4">Error fetching list: {countriesError}</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 h-fit">
        
        {/* HEADER */}
        <div className="bg-indigo-600 p-6 text-white">
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

          {/* === STEP 1: INPUT === */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Country Selector */}
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Select Country..."
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                {/* Dropdown */}
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
                        <span className="text-gray-400 text-sm">{c.dialCode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone Input */}
              <div className="opacity-100 transition-opacity">
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
                    className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                  />
                </div>
                
                {/* Local Validation Feedback */}
                {validationState && (
                  <div className={`mt-2 text-sm flex items-center gap-1 ${validationState.valid ? 'text-green-600' : 'text-red-500'}`}>
                    {validationState.valid ? <Check className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                    {validationState.message}
                  </div>
                )}
              </div>

              <button
                onClick={handleLookupAndFetch}
                disabled={loading || !validationState?.valid}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Continue'}
              </button>
            </div>
          )}

          {/* === STEP 2: PLANS === */}
          {step === 2 && operator && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-500 font-bold uppercase tracking-wider">Operator</div>
                  <div className="text-blue-900 font-bold text-lg flex items-center gap-2">
                    <Wifi className="w-5 h-5" /> {operator.operatorName}
                  </div>
                </div>
                <button onClick={resetFlow} className="text-sm text-blue-600 underline">Change</button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {products.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No plans available.</p>
                ) : (
                  products.map(p => (
                    <div key={p.id} onClick={() => handlePurchase(p)} 
                      className="group p-4 border rounded-xl hover:border-indigo-500 cursor-pointer transition-all hover:shadow-md bg-white">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold text-gray-800">{p.name}</div>
                          <div className="text-sm text-gray-500 mt-1">{p.amount}</div>
                        </div>
                        <CreditCard className="w-5 h-5 text-gray-300 group-hover:text-indigo-500" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* === STEP 3: SUCCESS === */}
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

        </div>
      </div>
    </div>
  );
}
