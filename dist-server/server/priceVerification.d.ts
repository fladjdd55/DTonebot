export interface PriceVerificationResult {
    valid: boolean;
    expectedPrice?: number;
    expectedCurrency?: string;
    error?: string;
    code?: string;
}
export declare const priceVerificationService: {
    /**
     * Verify that the payment amount matches the product price
     * Returns the expected price for the product
     */
    verifyProductPrice(productId: number, paidAmount: number, paidCurrency: string): Promise<PriceVerificationResult>;
    /**
     * Get product price for payment intent creation
     */
    getProductPrice(productId: number): Promise<{
        success: boolean;
        price?: number;
        currency?: string;
        min?: number;
        max?: number;
        type?: string;
        error?: string;
    }>;
};
