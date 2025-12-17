// client/src/components/RechargeFlow.tsx - FIXED VERSION
// Key Changes:
// 1. REMOVED all price calculations from client
// 2. Server returns final price in payment intent response
// 3. Simplified confirmation modal
// 4. Better loading states
// 5. Proper error handling

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, AlertCircle, Phone, Loader2, ArrowRight, X } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import type { CountryCode } from 'libphonenumber-js';

import { useCountries } from '../hooks/useCountries';
import { useOperators } from '../hooks/useOperators';
import { useProducts } from '../hooks/useProducts';
import { formatPhoneNumber, extractDigits, validatePhoneNumber } from '../../../shared/phoneValidator';
import { filterCountries } from '../shared/countryValidator';
import { rechargeApi, type Product } from '../services/api';
import PaymentModal from './PaymentModal';

// ✅ NO MORE CLIENT-SIDE PRICE CALCULATION!
// Server handles ALL pricing logic

export default function RechargeFlow() {
  const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [validationState, setValidationState] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [operator, setOperator] = useState<any>(null);
  const [txnResult, setTxnResult] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'AIRTIME' | 'DATA' | 'BUNDLES'>('AIRTIME');
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [operatorSearch, setOperatorSearch] = useState('');
  
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  // ✅ NEW: Store server-calculated price info
  const [pendingPurchase, setPendingPurchase] = useState<{
    product: Product;
    mobile: string;
    customAmount?: number;
    serverPrice?: {
      usdPrice: number;
      localAmount: number;
      currency: string;
      breakdown: any;
    };
  } | null>(null);
  
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [currency, setCurrency] = useState('');
  const [priceFilter, setPriceFilter] = useState<number | 'ALL'>('ALL');
  
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customAmountError, setCustomAmountError] = useState<string | null>(null);
  const [selectedRangedProduct, setSelectedRangedProduct] = useState<Product | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const { countries, loading: countriesLoading } = useCountries();
  const { operators: availableOperators } = useOperators(selectedCountry?.iso3);
  const { products: allProducts, loading: productsLoading } = useProducts(operator?.operatorId, '', undefined);

  // Filter products
  const { fixedProducts, rangedProducts } = useMemo(() => {
    const rawFixed = allProducts.filter(p => !p.type?.includes('RANGED'));
    const rawRanged = allProducts.filter(p => p.type?.includes('RANGED'));

    let fixed = rawFixed;
    if (currency) {
      fixed = fixed.filter(p => p.currency === currency);
    }
    
    if (priceFilter !== 'ALL') {
      fixed = fixed.filter(p => {
        // ✅ Filter by server-provided costPrice (wholesale + margin)
        if (!p.costPrice) return true; // Show if no price data
        const estimatedPrice = p.costPrice * 1.15; // Rough estimate for filtering only
        return Math.abs(estimatedPrice - priceFilter) <= 3;
      });
    }
    
    return { fixedProducts: fixed, rangedProducts: rawRanged };
  }, [allProducts, currency, priceFilter]);

  const categorizedProducts = useMemo(() => {
    return {
      AIRTIME: fixedProducts.filter(p => p.subserviceId !== 12 && p.subserviceId !== 13),
      DATA: fixedProducts.filter(p => p.subserviceId === 12),
      BUNDLES: fixedProducts.filter(p => p.subserviceId === 13),
    };
  }, [fixedProducts]);

  // ... (keep all your existing handlers for country/phone/operator selection)

  // ✅ FIXED: Purchase handler - NO price calculation!
  const handlePurchase = async (product: Product, customAmountValue?: number) => {
    setLoading(true);
    setApiError('');
    
    try {
      // Call server to get REAL price
      const priceResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          mobile: validationState?.fullNumber || '',
          type: product.type,
          customAmount: customAmountValue // Only for ranged products
        })
      });

      if (!priceResponse.ok) {
        const error = await priceResponse.json();
        throw new Error(error.error || 'Failed to calculate price');
      }

      const priceData = await priceResponse.json();

      // Store purchase with SERVER-CALCULATED price
      setPendingPurchase({
        product,
        mobile: validationState?.fullNumber || '',
        customAmount: customAmountValue,
        serverPrice: {
          usdPrice: priceData.chargeAmount,
          localAmount: priceData.localAmount,
          currency: priceData.currency,
          breakdown: priceData.breakdown
        }
      });

      setIsConfirmModalOpen(true);

    } catch (error: any) {
      setApiError(error.message || 'Failed to prepare purchase');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPurchase = () => {
    setIsConfirmModalOpen(false);
    setIsPayModalOpen(true);
  };

  const executeTransaction = async (paymentId: string) => {
    if (!pendingPurchase) return;
    
    setIsProcessingTransaction(true);
    setApiError('');

    try {
      // Call purchase API (server will verify everything)
      let result = await rechargeApi.purchase(
        pendingPurchase.product.id,
        pendingPurchase.mobile,
        pendingPurchase.customAmount || parseFloat(pendingPurchase.product.amount),
        pendingPurchase.serverPrice?.currency || 'USD',
        pendingPurchase.product.type,
        paymentId
      );

      // Poll for status if pending
      if (result.success && result.dbStatus === 'PENDING') {
        const MAX_RETRIES = 15;
        let retries = 0;
        
        while (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            const statusUpdate = await rechargeApi.checkStatus(paymentId);
            
            if (statusUpdate.status === 'COMPLETED') {
              result = { ...result, success: true, dbStatus: 'COMPLETED', ...statusUpdate };
              break;
            }
            
            if (['FAILED', 'REFUNDED'].includes(statusUpdate.status)) {
              result = { 
                ...result, 
                success: false, 
                dbStatus: statusUpdate.status, 
                refunded: statusUpdate.status === 'REFUNDED' 
              };
              break;
            }
          } catch (pollErr) {
            console.warn("Polling status failed:", pollErr);
          }
          
          retries++;
        }
      }

      if (!result.success) {
        const errorMsg = result.refunded 
          ? `Transaction failed. Your payment has been refunded automatically.`
          : `Transaction failed: ${result.message || result.error || 'Unknown error'}`;
        
        setApiError(errorMsg);
        setIsProcessingTransaction(false);
        return;
      }

      // Success!
      setTxnResult(result);
      setIsProcessingTransaction(false);
      setPendingPurchase(null);
      setApiError('');
      
      setTimeout(() => {
        setIsPayModalOpen(false);
        setStep(3);
      }, 100);
      
    } catch (err: any) {
      console.error("Transaction Error:", err);
      setApiError(err.message || 'Transaction failed. Please try again.');
      setIsProcessingTransaction(false);
    }
  };

  const handleCloseModal = () => {
    setIsPayModalOpen(false);
    setApiError('');
    setPendingPurchase(null);
    setIsProcessingTransaction(false);
  };

  // ... (keep all other handlers)

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* ... (keep existing header) */}

        <div className="p-6">
          {apiError && !isPayModalOpen && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {apiError}
            </div>
          )}

          {/* ... (keep step 1 and 1.5 as-is) */}

          {step === 2 && operator && (
            <div className="space-y-4">
              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categorizedProducts[activeTab].map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => handlePurchase(p)}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-3 border rounded-xl hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-gray-800 text-xl">
                      {p.amount.split(' ')[0]}
                    </span>
                    <span className="text-xs font-medium text-gray-400 uppercase">
                      {p.currency}
                    </span>
                    {/* ✅ Show estimated price range (not exact calculation) */}
                    {p.costPrice && (
                      <span className="text-[11px] text-indigo-600 font-medium mt-1">
                        ~${(p.costPrice * 1.15).toFixed(0)}-${(p.costPrice * 1.20).toFixed(0)}
                      </span>
                    )}
                    {loading && <Loader2 className="w-4 h-4 animate-spin mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ✅ FIXED: Confirmation Modal shows SERVER price */}
          {pendingPurchase && (
            <div className={`fixed inset-0 z-50 ${isConfirmModalOpen ? 'flex' : 'hidden'} items-center justify-center p-4 bg-black/60`}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <h3 className="font-bold text-xl mb-4">Confirm Purchase</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Recipient Gets:</span>
                    <span className="font-bold">
                      {pendingPurchase.serverPrice?.localAmount} {pendingPurchase.serverPrice?.currency}
                    </span>
                  </div>
                  
                  <div className="flex justify-between bg-indigo-50 p-3 rounded-lg">
                    <span className="text-indigo-700 font-medium">You Pay:</span>
                    <span className="font-bold text-indigo-700 text-lg">
                      ${pendingPurchase.serverPrice?.usdPrice.toFixed(2)} USD
                    </span>
                  </div>

                  {pendingPurchase.serverPrice?.breakdown && (
                    <div className="text-xs text-gray-500">
                      <details>
                        <summary className="cursor-pointer">Price breakdown</summary>
                        <div className="mt-2 space-y-1 pl-2">
                          <div>Base cost: ${pendingPurchase.serverPrice.breakdown.baseCost.toFixed(2)}</div>
                          <div>Margin: {((pendingPurchase.serverPrice.breakdown.margin - 1) * 100).toFixed(0)}%</div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="flex-1 py-3 border rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmPurchase}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment Modal */}
          {pendingPurchase && isPayModalOpen && (
            <PaymentModal
              isOpen={isPayModalOpen}
              onClose={handleCloseModal}
              amount={pendingPurchase.serverPrice?.usdPrice || 0}
              currency="USD"
              onSuccess={executeTransaction}
              mobile={pendingPurchase.mobile}
              productId={pendingPurchase.product.id}
              productType={pendingPurchase.product.type}
              transactionError={apiError}
              isProcessingTransaction={isProcessingTransaction}
              onClearError={() => setApiError('')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
