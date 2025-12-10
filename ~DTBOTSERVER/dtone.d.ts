import { ApiResponse, LookupResult, Product, TransactionResult, Country } from './types';
export declare const dtoneService: {
    getCountries(serviceId?: number): Promise<ApiResponse<Country[]>>;
    lookupMobileNumber(mobile: string): Promise<ApiResponse<LookupResult>>;
    getProductsForOperator(operatorId: number, serviceId?: number, perPage?: number): Promise<ApiResponse<Product[]>>;
    purchaseProduct(productId: number, mobile: string, amount: number, unit?: string): Promise<ApiResponse<TransactionResult>>;
    purchaseTopup(mobile: string, productId: number, amount?: number): Promise<ApiResponse<TransactionResult | LookupResult>>;
    getAllOperators(serviceId?: number): Promise<ApiResponse<any[]>>;
};
