"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePhoneNumber = exports.extractDigits = exports.formatPhoneNumber = void 0;
const libphonenumber_js_1 = require("libphonenumber-js");
const formatPhoneNumber = (value, countryCode) => {
    if (!value)
        return '';
    try {
        const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(value, countryCode);
        if (phoneNumber) {
            // ✅ FIX: Use 'INTERNATIONAL' (Uppercase)
            return phoneNumber.format('NATIONAL');
        }
    }
    catch (error) {
        return value;
    }
    return value;
};
exports.formatPhoneNumber = formatPhoneNumber;
const extractDigits = (value) => {
    return value.replace(/\D/g, '');
};
exports.extractDigits = extractDigits;
const validatePhoneNumber = (digits, countryCode) => {
    if (!digits) {
        return { valid: false, message: 'Phone number is required' };
    }
    try {
        if ((0, libphonenumber_js_1.isValidPhoneNumber)(digits, countryCode)) {
            const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(digits, countryCode);
            return {
                valid: true,
                fullNumber: phoneNumber.number.toString()
            };
        }
        else {
            return { valid: false, message: 'Invalid number for this country' };
        }
    }
    catch (error) {
        return { valid: false, message: 'Invalid phone number format' };
    }
};
exports.validatePhoneNumber = validatePhoneNumber;
