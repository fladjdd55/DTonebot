"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingService = void 0;
const config_1 = require("../config");
exports.pricingService = {
    /**
     * The core formula for calculating Price from Cost.
     * Centralizes the margin logic so it's the same for UI, Payment, and Verification.
     */
    calculatePrice(product, customAmount) {
        let cost = product.costPrice || product.amount || 0;
        let localAmount = product.amount || 0; // The amount the user receives (e.g. 500 INR)
        // Handle Ranged Products (e.g. User wants 500 INR, we calculate USD cost)
        // Standardizing on .includes('RANGE') to catch 'RANGED_VALUE' and 'RANGE'
        if (product.type && product.type.toUpperCase().includes('RANGE') && customAmount) {
            const unitCost = (product.costPriceMin || 0) / (product.minAmount || 1);
            cost = customAmount * unitCost;
            localAmount = customAmount;
        }
        const finalCharge = cost * config_1.FALLBACK_MARGIN;
        return {
            cost,
            finalCharge, // The amount we charge the user (USD)
            localAmount, // The amount sent to the phone
            currency: product.currency,
            // Check if it meets the global $5 minimum
            isBelowMin: finalCharge < config_1.GLOBAL_MIN_USD,
            minRequired: config_1.GLOBAL_MIN_USD,
            // Check if it exceeds the global maximum (Overflow protection)
            isAboveMax: finalCharge > config_1.GLOBAL_MAX_USD,
            maxAllowed: config_1.GLOBAL_MAX_USD
        };
    },
    /**
     * Calculates the Safe Minimum Amount for the frontend.
     * Ensures the slider minimum is high enough to cover our costs + global min.
     */
    getSafeMinAmount(p) {
        let safeMin = p.minAmount || 0;
        if (p.type && p.type.toUpperCase().includes('RANGE')) {
            const baseMinCost = p.costPriceMin || p.costPrice;
            // Logic: (UnitCost * Units * Margin) must be >= GLOBAL_MIN_USD
            if (baseMinCost && baseMinCost > 0) {
                const costPerUnit = baseMinCost / (p.minAmount || 1);
                const targetCostUsd = config_1.GLOBAL_MIN_USD / config_1.FALLBACK_MARGIN;
                const requiredUnits = targetCostUsd / costPerUnit;
                if (requiredUnits > safeMin) {
                    safeMin = Math.ceil(requiredUnits);
                }
            }
            // Fallback: If no cost data, assume ~1:1 conversion for USD
            else if (p.currency === 'USD') {
                const targetUnits = config_1.GLOBAL_MIN_USD / config_1.FALLBACK_MARGIN;
                if (targetUnits > safeMin)
                    safeMin = Math.ceil(targetUnits);
            }
        }
        return safeMin;
    }
};
