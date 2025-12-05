// server/types.ts

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

// --- NEW INTERFACE ---
export interface Country {
  iso_code: string;
  name: string;
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
}

export interface TransactionResult {
  id: number;
  status: string;
  externalId: string;
  message?: string;
}
