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
export declare const validatePhoneNumber: (number: string, countryCode: CountryCode) => PhoneValidationResult | null;
export declare const formatPhoneNumber: (input: string, countryCode: CountryCode) => string;
export declare const extractDigits: (phoneNumber: string) => string;
export declare const getDialCode: (countryCode: CountryCode) => string;
