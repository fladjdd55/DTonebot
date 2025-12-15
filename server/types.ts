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
  // Cost fields for margin calculation
  costPrice?: number;       // Fixed cost OR min cost for ranged
  costPriceMin?: number;    // Min USD cost (for RANGED products)
  costPriceMax?: number;    // Max USD cost (for RANGED products)
  costCurrency?: string;
  isRanged?: boolean;
  subserviceId?: number;
  benefits?: string[];
}

export interface TransactionResult {
  id: number;
  status: string;
  statusId?: number; // ✅ ADDED: Required for Routes.ts to check success (7) vs decline (3/9)
  externalId: string;
  message?: string;
}

