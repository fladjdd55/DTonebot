// src/components/CountryPhoneForm.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Check, AlertCircle, Phone } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js'; 
import { getAllCountries, filterCountries, type Country } from '../validators/countryValidator';
import { validatePhoneNumber, formatPhoneNumber, extractDigits, type PhoneValidationResult } from '../validators/phoneValidator';

export default function CountryPhoneForm() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [validationState, setValidationState] = useState<PhoneValidationResult | null>(null);
  const [touched, setTouched] = useState(false);

  // Ref for the dropdown to detect clicks outside
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allCountries = useMemo(() => getAllCountries(), []);

  const filteredCountries = useMemo(() => {
    return filterCountries(searchQuery);
  }, [searchQuery]);

  // Handle "Click Outside" to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setSearchQuery(country.name);
    setShowDropdown(false);
    setPhoneNumber('');
    setValidationState(null);
    setTouched(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowDropdown(true);
    
    if (selectedCountry && value !== selectedCountry.name) {
      setSelectedCountry(null);
      setPhoneNumber('');
      setValidationState(null);
      setTouched(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCountry) return;
    
    const code = selectedCountry.code as CountryCode;
    
    // 1. Strip '+' immediately to prevent double usage (since we show +1 in the badge)
    const value = e.target.value.replace(/\+/g, '');
    
    // 2. Detect deletion to prevent "locking" the cursor
    const isDeleting = value.length < phoneNumber.length;
    const nextValue = isDeleting ? value : formatPhoneNumber(value, code);
    
    setPhoneNumber(nextValue);
    
    if (touched) {
      const digits = extractDigits(nextValue);
      setValidationState(validatePhoneNumber(digits, code));
    }
  };

  const handlePhoneBlur = () => {
    setTouched(true);
    if (selectedCountry) {
      const code = selectedCountry.code as CountryCode;
      const digits = extractDigits(phoneNumber);
      setValidationState(validatePhoneNumber(digits, code));
    }
  };

  const handleSubmit = () => {
    if (!selectedCountry) return;
    setTouched(true);
    const code = selectedCountry.code as CountryCode;
    const digits = extractDigits(phoneNumber);
    const validation = validatePhoneNumber(digits, code);
    setValidationState(validation);
    
    if (validation?.valid) {
      alert(`✅ Valid Number!\n${validation.fullNumber}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <Phone className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Phone Number Registration
            </h1>
          </div>
          <p className="text-gray-600 mb-8">
            Select your country and enter your phone number
          </p>

          <div className="space-y-6">
            {/* Country Search Section */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Country
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search country..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                />
              </div>

              {/* Dropdown Menu */}
              {showDropdown && filteredCountries.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredCountries.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => handleCountrySelect(country)}
                      className="w-full px-4 py-3 text-left hover:bg-indigo-50 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <ReactCountryFlag countryCode={country.code} svg />
                        <span className="font-medium text-gray-800">{country.name}</span>
                      </div>
                      <span className="text-sm text-gray-500">{country.dialCode}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Country Reminder */}
              {selectedCountry && (
                <div className="mt-3 flex items-center gap-3 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg animate-fade-in">
                  <ReactCountryFlag
                    countryCode={selectedCountry.code}
                    svg
                    style={{ width: '1.5em', height: '1.5em', borderRadius: '4px' }}
                  />
                  <span>
                    You selected: <strong>{selectedCountry.name}</strong> ({selectedCountry.dialCode})
                  </span>
                  <Check className="w-4 h-4 ml-auto text-indigo-500" />
                </div>
              )}
            </div>

            {/* Phone Number Input Section */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="flex gap-3">
                {/* Dial Code Badge */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border-2 border-gray-200 rounded-lg font-semibold min-w-[100px] justify-center text-gray-700">
                  {selectedCountry ? selectedCountry.dialCode : '+--'}
                </div>
                
                {/* Input Field */}
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  onBlur={handlePhoneBlur}
                  disabled={!selectedCountry}
                  placeholder={selectedCountry ? "Enter phone number" : "Select a country first"}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Validation Message Area (Fixed height to stop jumping) */}
              <div className="min-h-[90px] mt-3">
                {touched && validationState ? (
                  <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-lg ${
                    validationState.valid 
                      ? 'text-green-700 bg-green-50 border border-green-200' 
                      : 'text-red-700 bg-red-50 border border-red-200'
                  }`}>
                    {validationState.valid ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <div>
                      <p className="font-medium">{validationState.message}</p>
                      {validationState.valid && (
                        <p className="text-xs mt-1">Formatted: {validationState.fullNumber}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-0" />
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!selectedCountry || !phoneNumber}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
            >
              Validate & Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
