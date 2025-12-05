// src/validators/phoneValidator.ts
import { 
  parsePhoneNumberFromString, 
  getCountryCallingCode, 
  AsYouType
} from 'libphonenumber-js';
// Import CountryCode using 'import type' to prevent runtime crashes
import type { CountryCode } from 'libphonenumber-js';

export interface PhoneValidationResult {
  valid: boolean;
  message: string;
  fullNumber?: string;
  national?: string;
  type?: string;
  country?: string;
  severity?: 'warning' | 'error';
}

/**
 * Validates a phone number for a specific country
 */
export const validatePhoneNumber = (number: string, countryCode: CountryCode): PhoneValidationResult | null => {
  if (!countryCode || !number) return null;

  try {
    const phoneNumber = parsePhoneNumberFromString(number, countryCode);

    if (!phoneNumber) {
      const digits = number.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 3) {
        return {
          valid: false,
          message: 'Phone number is too short.',
          severity: 'warning'
        };
      }
      return {
        valid: false,
        message: 'Invalid phone number format.',
        severity: 'error'
      };
    }

    if (phoneNumber.isValid()) {
      // STRICT CHECK: Ensure the number actually belongs to the selected country
      if (phoneNumber.country !== countryCode) {
        return {
          valid: false,
          message: `Number does not match selected country (${countryCode}).`,
          severity: 'error'
        };
      }

      return {
        valid: true,
        message: 'Valid phone number',
        fullNumber: phoneNumber.formatInternational(),
        national: phoneNumber.formatNational(),
        type: phoneNumber.getType() || 'Unknown',
        country: phoneNumber.country
      };
    } else {
      return {
        valid: false,
        message: `Invalid phone number for ${countryCode}.`,
        severity: 'error'
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: 'Unable to validate phone number.',
      severity: 'error'
    };
  }
};

export const formatPhoneNumber = (input: string, countryCode: CountryCode): string => {
  if (!countryCode || !input) return input || '';
  return new AsYouType(countryCode).input(input);
};

export const extractDigits = (phoneNumber: string): string => {
  return phoneNumber.replace(/\D/g, '');
};

export const getDialCode = (countryCode: CountryCode): string => {
  try {
    return `+${getCountryCallingCode(countryCode)}`;
  } catch {
    return '+--';
  }
};
