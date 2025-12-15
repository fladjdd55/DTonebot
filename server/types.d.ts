export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}
export interface Country {
    name: string;
    iso_code: string;
}
export interface LookupResult {
    operatorId: number;
    operatorName: string;
    countryIso: string;
    identified: boolean;
}
export interface Product {
    id: number;
    name: string;
    type: string;
    amount: string;
    currency: string;
    min: number;
    max: number;
    subserviceId?: number;
}
export interface TransactionResult {
    id: number;
    status: string;
    externalId: string;
    message?: string;
}




import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      name?: string | null;
      phone?: string | null;
      role?: string;
    };
  }
}
