"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingService = void 0;
exports.pricingService = {
    calculatePrice(productId, mobile) {
        // ... calculation logic
        return {
            // Public fields (safe for frontend)
            finalCharge: calculatedCharge,
            localAmount: product.localAmount,
            currency: product.currency,
            productName: product.name,
            // Internal fields (never send to frontend)
            _internal: {
                basePrice: product.basePrice,
                marginPercent: margin,
                marginAmount: marginAmount,
                fxSpread: fxSpread,
                dtOneCost: dtOneCost,
            },
        };
    },
    // Helper to strip internal data
    toPublic(priceData) {
        const { _internal, ...public } = priceData;
        return public;
    },
};
