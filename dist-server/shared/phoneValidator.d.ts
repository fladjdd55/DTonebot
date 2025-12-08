import { CountryCode } from 'libphonenumber-js';
export interface PhoneValidationResult {
    valid: boolean;
    message?: string;
    fullNumber?: string;
}
export declare const formatPhoneNumber: (value: string, countryCode: CountryCode) => string;
export declare const extractDigits: (value: string) => string;
export declare const validatePhoneNumber: (digits: string, countryCode: CountryCode) => PhoneValidationResult;
