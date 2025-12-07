"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDialCode = exports.extractDigits = exports.formatPhoneNumber = exports.validatePhoneNumber = void 0;
// shared/phoneValidator.ts
var libphonenumber_js_1 = require("libphonenumber-js");
/**
 * Validates a phone number for a specific country
 */
var validatePhoneNumber = function (number, countryCode) {
    if (!countryCode || !number)
        return null;
    try {
        var phoneNumber = (0, libphonenumber_js_1.parsePhoneNumberFromString)(number, countryCode);
        if (!phoneNumber) {
            var digits = number.replace(/\D/g, '');
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
                    message: "Number does not match selected country (".concat(countryCode, ")."),
                    severity: 'error'
                };
            }
            return {
                valid: true,
                message: 'Valid phone number',
                // FIX: Use E.164 to ensure the API receives a clean number (e.g. +12125551234)
                fullNumber: phoneNumber.format('E.164'),
                national: phoneNumber.formatNational(),
                type: phoneNumber.getType() || 'Unknown',
                country: phoneNumber.country
            };
        }
        else {
            return {
                valid: false,
                message: "Invalid phone number for ".concat(countryCode, "."),
                severity: 'error'
            };
        }
    }
    catch (error) {
        return {
            valid: false,
            message: 'Unable to validate phone number.',
            severity: 'error'
        };
    }
};
exports.validatePhoneNumber = validatePhoneNumber;
var formatPhoneNumber = function (input, countryCode) {
    if (!countryCode || !input)
        return input || '';
    try {
        // Wrapped in try/catch to prevent crashes on invalid inputs
        return new libphonenumber_js_1.AsYouType(countryCode).input(input);
    }
    catch (e) {
        return input;
    }
};
exports.formatPhoneNumber = formatPhoneNumber;
var extractDigits = function (phoneNumber) {
    return phoneNumber.replace(/\D/g, '');
};
exports.extractDigits = extractDigits;
var getDialCode = function (countryCode) {
    try {
        return "+".concat((0, libphonenumber_js_1.getCountryCallingCode)(countryCode));
    }
    catch (_a) {
        return '+--';
    }
};
exports.getDialCode = getDialCode;
