export declare const pricingService: {
    /**
     * The core formula for calculating Price from Cost.
     * Centralizes the margin logic so it's the same for UI, Payment, and Verification.
     */
    calculatePrice(product: any, customAmount?: number): {
        cost: any;
        finalCharge: number;
        localAmount: any;
        currency: any;
        isBelowMin: boolean;
        minRequired: number;
    };
    /**
     * Calculates the Safe Minimum Amount for the frontend.
     * Ensures the slider minimum is high enough to cover our costs + global min.
     */
    getSafeMinAmount(p: any): number;
};
