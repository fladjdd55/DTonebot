// server/types.ts

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
  benefits?: string[]; // Added optional benefits array just in case
}

export interface TransactionResult {
  id: number;
  status: string;
  statusId?: number; // 👈 ✅ Added this field
  externalId: string;
  message?: string;
}
