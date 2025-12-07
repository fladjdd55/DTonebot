"use strict";
// shared/countryValidator.ts
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCountrySupported = exports.getCountryByCode = exports.filterCountries = exports.getAllCountries = void 0;
// Helper to sort countries
var getAllCountries = function (countries) {
    return __spreadArray([], countries, true).sort(function (a, b) { return a.name.localeCompare(b.name); });
};
exports.getAllCountries = getAllCountries;
// The logic you fixed earlier, now centralized here
var filterCountries = function (countries, query) {
    var list = countries || [];
    if (!query)
        return (0, exports.getAllCountries)(list);
    var term = query.toLowerCase();
    return list.filter(function (c) {
        return c.name.toLowerCase().includes(term) ||
            c.code.toLowerCase().includes(term) ||
            c.dialCode.includes(term);
    });
};
exports.filterCountries = filterCountries;
var getCountryByCode = function (countries, code) {
    return (countries || []).find(function (c) { return c.code === code; });
};
exports.getCountryByCode = getCountryByCode;
var isCountrySupported = function (countries, code) {
    return (countries || []).some(function (c) { return c.code === code; });
};
exports.isCountrySupported = isCountrySupported;
