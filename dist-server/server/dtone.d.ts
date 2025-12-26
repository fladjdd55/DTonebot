import { ApiResponse, LookupResult, Product, TransactionResult, Country } from './types';
export declare const dtoneService: {
    getCountries(serviceId?: number): Promise<ApiResponse<Country[]>>;
    lookupMobileNumber(mobile: string): Promise<ApiResponse<LookupResult>>;
    getProductsForOperator(operatorId: number, serviceId?: number, perPage?: number, lang?: string): Promise<ApiResponse<Product[]>>;
    purchaseProduct(productId: number, mobile: string, amount: number, unit?: string, type?: string, callbackUrl?: string, countryIso?: string): Promise<ApiResponse<TransactionResult>>;
    purchaseTopup(mobile: string, productId: number, amount?: number): Promise<ApiResponse<TransactionResult | LookupResult>>;
    getTransaction(externalId: string): Promise<ApiResponse<any>>;
    getAllOperators(serviceId?: number): Promise<ApiResponse<any[]>>;
};
