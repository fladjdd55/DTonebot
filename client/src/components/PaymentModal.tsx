// client/src/components/PaymentModal.tsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  X, 
  ShieldCheck, 
  CreditCard, 
  AlertCircle, 
  RefreshCw,
//  CheckCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { getAccessToken } from '../services/api';

// ✅ Initialize Stripe outside component
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = loadStripe(STRIPE_KEY);

if (!STRIPE_KEY) console.error("⚠️ Stripe Key missing in .env");

// ============================================================
// TYPES
// ============================================================

// Props for the main Modal (Parent)
interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency: string;
  mobile: string;
  productId: number;
  productType?: string;
  clientSecret?: string;
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
  transactionError?: string;
  isProcessingTransaction?: boolean;
  onClearError?: () => void;
}

// Props for the Internal Form (Child) - ✅ NEW INTERFACE
interface PaymentFormProps {
  amount: number;
  currency: string;
  chargeAmountUsd: number | null;
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
  transactionError?: string;
  isProcessingTransaction?: boolean;
  onClearError?: () => void;
  onRetry: () => void;
}

interface PaymentIntentResponse {
  clientSecret: string;
  id: string;
  chargeAmount: number;
  isGuest: boolean;
  error?: string;
}

// ============================================================
// INTERNAL FORM COMPONENT (Child)
// ============================================================

function PaymentForm({ 
  amount, 
  currency, 
  chargeAmountUsd, 
  onSuccess, 
  onError, 
  transactionError,
  isProcessingTransaction,
  onClearError,
  onRetry
}: PaymentFormProps) { // ✅ Use the interface here
  
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync parent transaction error
  useEffect(() => {
    if (transactionError) {
      setLocalError(transactionError);
      setIsProcessing(false); 
    }
  }, [transactionError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setLocalError(null);
    onClearError?.();

    try {
      // 1. Validate form
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setLocalError(submitError.message || 'Please check your details');
        setIsProcessing(false);
        return;
      }

      // 2. Confirm Payment
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/?payment_status=success`,
        },
        redirect: 'if_required'
      });

      if (error) {
        setLocalError(error.message || 'Payment failed');
        onError?.(error.message || 'Payment failed');
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // 3. Handover to parent for backend processing
        onSuccess?.(paymentIntent.id);
      } else {
        setLocalError(`Payment Status: ${paymentIntent?.status}`);
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error(err);
      setLocalError('An unexpected error occurred');
      setIsProcessing(false);
    }
  };

  const displayAmount = chargeAmountUsd ?? amount;
  const isLoading = isProcessing || isProcessingTransaction;

  return (
    <form onSubmit={handleSubmit}>
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">
          ${displayAmount.toFixed(2)} <span className="text-lg text-gray-500">USD</span>
        </p>
        {currency !== 'USD' && chargeAmountUsd && (
          <p className="text-sm text-gray-500 mt-1">≈ {amount.toLocaleString()} {currency}</p>
        )}
      </div>

      <div className="mb-6">
        <PaymentElement />
      </div>

      {localError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      {/* Action Buttons */}
      {transactionError ? (
        <button
          type="button"
          onClick={onRetry} 
          className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      ) : (
        <button
          type="submit"
          disabled={!stripe || isLoading}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isProcessingTransaction ? 'Finalizing...' : 'Processing...'}
            </>
          ) : (
            <>
              Pay ${displayAmount.toFixed(2)}
              <ShieldCheck className="w-5 h-5 opacity-80" />
            </>
          )}
        </button>
      )}
    </form>
  );
}

// ============================================================
// PARENT MODAL (Manages Fetching & Providers)
// ============================================================

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  clientSecret: propClientSecret, 
  amount, 
  currency, 
  mobile, 
  productId, 
  productType, 
  onSuccess, 
  onError, 
  transactionError, 
  isProcessingTransaction, 
  onClearError 
}: PaymentModalProps) {

  const [fetchedClientSecret, setFetchedClientSecret] = useState<string | null>(null);
  const [chargeAmountUsd, setChargeAmountUsd] = useState<number | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  
  const isMountedRef = useRef(true);
  const fetchAttemptRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeClientSecret = propClientSecret || fetchedClientSecret;

  // Cleanup on mount/unmount/close
  useEffect(() => {
    if (isOpen) {
      isMountedRef.current = true;
      setInitError(null);
    } else {
      isMountedRef.current = false;
      setFetchedClientSecret(null);
      setChargeAmountUsd(null);
      setInitError(null);
      onClearError?.(); // Removed from dependencies below to fix loop
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
    return () => { isMountedRef.current = false; };
  }, [isOpen, propClientSecret]); 

  // Fetch Intent Logic
  const fetchPaymentIntent = useCallback(async () => {
    if (!isOpen || propClientSecret || !amount || !productId) return;

    fetchAttemptRef.current += 1;
    const currentAttempt = fetchAttemptRef.current;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setInitError(null);

    try {
      const token = getAccessToken();
      const idempotencyKey = `pi_${productId}_${amount}_${currency}_${Date.now()}`;

      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          'idempotency-key': idempotencyKey
        },
        credentials: 'include',
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          customAmount: amount,
          currency,
          productId,
          type: productType,
          mobile
        })
      });

      if (!isMountedRef.current || currentAttempt !== fetchAttemptRef.current) return;

      const data: PaymentIntentResponse = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      setFetchedClientSecret(data.clientSecret);
      setChargeAmountUsd(data.chargeAmount);

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (isMountedRef.current) {
        console.error('[PaymentModal] Init Error:', err);
        setInitError(err.message || 'Failed to initialize payment');
      }
    }
  }, [isOpen, propClientSecret, amount, currency, productId, productType, mobile]);

  // Trigger fetch when ready
  useEffect(() => {
    if (isOpen && !propClientSecret && !fetchedClientSecret && !initError) {
      fetchPaymentIntent();
    }
  }, [isOpen, propClientSecret, fetchedClientSecret, initError, fetchPaymentIntent]);

  const handleRetry = () => {
    setFetchedClientSecret(null);
    setChargeAmountUsd(null);
    setInitError(null);
    onClearError?.();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Secure Payment
          </h3>
          <button 
            onClick={onClose} 
            disabled={isProcessingTransaction}
            className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-full disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col justify-center">
          
          {initError ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-gray-900 font-bold mb-2">Unable to Start Payment</p>
              <p className="text-sm text-gray-600 mb-6">{initError}</p>
              <button onClick={handleRetry} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 mx-auto">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          ) : activeClientSecret ? (
            <Elements 
              stripe={stripePromise} 
              options={{ 
                clientSecret: activeClientSecret,
                appearance: { theme: 'stripe' }
              }}
            >
              <PaymentForm 
                amount={amount}
                currency={currency}
                chargeAmountUsd={chargeAmountUsd}
                onSuccess={onSuccess}
                onError={onError}
                transactionError={transactionError}
                isProcessingTransaction={isProcessingTransaction}
                onClearError={onClearError}
                onRetry={handleRetry}
              />
            </Elements>
          ) : (
            <div className="text-center py-10">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Initializing Secure Checkout...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 border-t">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            <span>256-bit SSL encryption</span>
            <span className="mx-1">•</span>
            <span>Powered by Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
