"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePhoneNumber = exports.extractDigits = exports.formatPhoneNumber = void 0;
var libphonenumber_js_1 = require("libphonenumber-js");
var formatPhoneNumber = function (value, countryCode) {
    if (!value)
        return '';
    try {
        var phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(value, countryCode);
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
var extractDigits = function (value) {
    return value.replace(/\D/g, '');
};
exports.extractDigits = extractDigits;
var validatePhoneNumber = function (digits, countryCode) {
    if (!digits) {
        return { valid: false, message: 'Phone number is required' };
    }
    try {
        if ((0, libphonenumber_js_1.isValidPhoneNumber)(digits, countryCode)) {
            var phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(digits, countryCode);
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
