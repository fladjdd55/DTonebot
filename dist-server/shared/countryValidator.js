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
var getAllCountries = function (countries) {
    return __spreadArray([], (countries || []), true).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
};
exports.getAllCountries = getAllCountries;
var filterCountries = function (countries, query) {
    var list = countries || [];
    if (!query)
        return (0, exports.getAllCountries)(list);
    var term = query.toLowerCase().trim();
    return list.filter(function (c) {
        // 🛡️ Safety checks: Ensure property exists before .toLowerCase()
        var nameMatch = c.name && c.name.toLowerCase().includes(term);
        var codeMatch = c.code && c.code.toLowerCase().includes(term);
        var iso3Match = c.iso3 && c.iso3.toLowerCase().includes(term);
        var dialMatch = c.dialCode && c.dialCode.includes(term);
        return nameMatch || codeMatch || iso3Match || dialMatch;
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
