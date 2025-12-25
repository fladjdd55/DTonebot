import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check, AlertCircle, Loader2, Wifi } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
// Adjust import path based on your folder structure (going up 4 levels to root shared)
import { filterCountries, type Country } from '../../../../shared/countryValidator';

interface Props {
  countries: Country[];
  selectedCountry: Country | null;
  phoneNumber: string;
  validationState: any;
  loading: boolean;
  usingFallback: boolean;
  operatorsFallback: boolean;
  availableOperators: any[];
  onCountrySelect: (c: Country) => void;
  onClearCountry: () => void;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onManualSelect: (op: any) => void;
}

export default function CountryPhoneStep({
  countries, selectedCountry, phoneNumber, validationState, loading, 
  usingFallback, operatorsFallback, availableOperators,
  onCountrySelect, onClearCountry, onPhoneChange, onSubmit, onManualSelect
}: Props) {
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [opSearch, setOpSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter logic
  const filteredCountries = filterCountries(countries || [], searchQuery);
  const filteredOperators = availableOperators.filter(op => 
    op.name.toLowerCase().includes(opSearch.toLowerCase())
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (c: Country) => {
    onCountrySelect(c);
    setSearchQuery(c.name);
    setShowDropdown(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Offline Warning */}
      {(usingFallback || operatorsFallback) && (
        <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded flex items-center gap-2 border border-yellow-100">
          <Wifi className="w-3 h-3" /> Network Offline - Using offline mode
        </div>
      )}

      {/* Country Input */}
      <div className="relative" ref={dropdownRef}>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
        <div className="relative">
          {selectedCountry ? (
            <div className="absolute left-3 top-3 z-10 w-6 h-6">
              <ReactCountryFlag countryCode={selectedCountry.code} svg style={{ width: '1.5em', height: '1.5em' }} />
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
            className={`w-full pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${selectedCountry ? 'pl-12' : 'pl-10'}`}
          />
          {selectedCountry && (
            <button onClick={() => { onClearCountry(); setSearchQuery(''); }} className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {filteredCountries.map(c => (
              <button
                key={c.code}
                onClick={() => handleSelect(c)}
                className="w-full px-4 py-2 text-left hover:bg-indigo-50 flex items-center justify-between group transition-colors"
              >
                <span className="flex items-center gap-2 font-medium text-gray-700 group-hover:text-indigo-700">
                  <ReactCountryFlag countryCode={c.code} svg /> {c.name}
                </span>
                <span className="text-gray-400 text-sm font-mono group-hover:text-indigo-400">{c.iso3}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phone Input */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
        <div className="flex gap-3">
          <div className="flex items-center justify-center px-4 bg-gray-100 border rounded-lg font-mono text-gray-600 min-w-[4rem]">
            {selectedCountry ? selectedCountry.dialCode : '+--'}
          </div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={onPhoneChange}
            disabled={!selectedCountry}
            placeholder="Mobile Number"
            className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50 transition-all"
          />
        </div>
        {validationState && (
          <div className={`mt-2 text-sm flex items-center gap-1 font-medium ${validationState.valid ? 'text-green-600' : 'text-red-500'}`}>
            {validationState.valid ? <Check className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
            {validationState.message}
          </div>
        )}
      </div>

      {/* Main Action */}
      {!showManual && (
         <button 
            onClick={onSubmit} 
            disabled={loading || !validationState?.valid} 
            className="w-full bg-indigo-600 text-white py-3.5 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
         >
           {loading ? <Loader2 className="animate-spin" /> : 'Continue'}
         </button>
      )}

      {/* Manual Selection Fallback */}
      {showManual && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-sm font-bold text-gray-700 mb-2">Select Operator:</p>
          <input
            type="text"
            placeholder="Filter operators..."
            value={opSearch}
            onChange={(e) => setOpSearch(e.target.value)}
            className="w-full mb-3 px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto">
            {filteredOperators.map((op) => (
              <button
                key={op.id}
                onClick={() => onManualSelect(op)}
                className="p-3 border rounded-lg hover:border-indigo-500 hover:bg-indigo-50 text-left text-sm font-medium transition-colors"
              >
                {op.name}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {!showManual && selectedCountry && (
        <div className="text-center mt-2">
          <button 
            onClick={() => setShowManual(true)} 
            disabled={!validationState?.valid}
            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline disabled:opacity-50"
          >
            Select operator manually
          </button>
        </div>
      )}
    </div>
  );
}
