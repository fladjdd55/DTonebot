export interface PriceVerificationResult {
    valid: boolean;
    expectedPrice?: number;
    expectedCurrency?: string;
    error?: string;
    code?: string;
}
declare function getAdjustedMin(product: any): number;
export declare const priceVerificationService: {
    getAdjustedMin: typeof getAdjustedMin;
    verifyProductPrice(productId: number, paidAmount: number, paidCurrency: string): Promise<PriceVerificationResult>;
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
export {};
