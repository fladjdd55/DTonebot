import { parsePhoneNumber, CountryCode, isValidPhoneNumber } from 'libphonenumber-js';

export interface PhoneValidationResult {
  valid: boolean;
  message?: string;
  fullNumber?: string;
}

export const formatPhoneNumber = (value: string, countryCode: CountryCode): string => {
  if (!value) return '';
  
  try {
    const phoneNumber = parsePhoneNumber(value, countryCode);
    if (phoneNumber) {
      // ✅ FIX: Use 'INTERNATIONAL' (Uppercase)
      return phoneNumber.format('NATIONAL'); 
    }
  } catch (error) {
    return value; 
  }
  return value;
};

export const extractDigits = (value: string): string => {
  return value.replace(/\D/g, '');
};

export const validatePhoneNumber = (digits: string, countryCode: CountryCode): PhoneValidationResult => {
  if (!digits) {
    return { valid: false, message: 'Phone number is required' };
  }

  try {
    if (isValidPhoneNumber(digits, countryCode)) {
      const phoneNumber = parsePhoneNumber(digits, countryCode);
      return { 
        valid: true, 
        fullNumber: phoneNumber.number.toString()
      };
    } else {
      return { valid: false, message: 'Invalid number for this country' };
    }
  } catch (error) {
    return { valid: false, message: 'Invalid phone number format' };
  }
};
