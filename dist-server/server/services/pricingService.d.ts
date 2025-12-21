export declare const pricingService: {
    calculatePrice(productId: number, mobile: string): {
        finalCharge: any;
        localAmount: any;
        currency: any;
        productName: any;
        _internal: {
            basePrice: any;
            marginPercent: any;
            marginAmount: any;
            fxSpread: any;
            dtOneCost: any;
        };
    };
    toPublic(priceData: PriceData): PriceResponse;
};
