export declare const transactionService: {
    getSafeMinAmount(p: any): number;
    processPurchase(data: {
        paymentId: string;
        mobile?: string;
        email?: string;
        productId: number;
        amount: number;
        currency: string;
        type: string;
        userId?: string;
    }, source?: "API" | "WEBHOOK"): Promise<any>;
};
