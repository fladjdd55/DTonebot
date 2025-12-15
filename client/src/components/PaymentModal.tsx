// client/src/components/PaymentModal.tsx
// ============================================================
// PRODUCTION-READY PAYMENT MODAL
// Features:
// - Secure auth token handling
// - Server-side price display (what user actually pays)
// - Idempotency keys to prevent duplicate charges
// - Memory leak prevention
// - Retry mechanism on failures
// - Proper loading & error states
// - Mobile-friendly design
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { 
  X, 
  ShieldCheck, 
  CreditCard, 
  AlertCircle, 
  RefreshCw,
  CheckCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { getAccessToken } from '../services/api';

// ============================================================
// TYPES
// ============================================================

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  // Payment Details
  amount: number;           // Local currency amount (e.g., 500 HTG)
  currency: string;         // Local currency code (e.g., 'HTG')
  mobile: string;           // Recipient phone number
  productId: number;        // Product ID from database
  productType?: string;     // FIXED or RANGED
  
  // Optional: Pre-fetched client secret (skip auto-fetch)
  clientSecret?: string;
  
  // Callbacks
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
  
  // External state (from parent for transaction processing)
  transactionError?: string;
  isProcessingTransaction?: boolean;
  onClearError?: () => void;
}

interface PaymentIntentResponse {
  clientSecret: string;
  id: string;
  chargeAmount: number;     // Actual USD amount to charge
  isGuest: boolean;
  error?: string;
}

type ModalState = 
  | 'initializing'          // Fetching payment intent
  | 'ready'                 // Payment form ready
  | 'processing'            // Stripe confirming payment
  | 'completing'            // Parent processing transaction
  | 'success'               // Payment complete
  | 'error';                // Fatal error (can retry)

// ============================================================
// COMPONENT
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
  
  // Stripe hooks
  const stripe = useStripe();
  const elements = useElements();
  
  // Component state
  const [modalState, setModalState] = useState<ModalState>('initializing');
  const [fetchedClientSecret, setFetchedClientSecret] = useState<string | null>(null);
  const [chargeAmountUsd, setChargeAmountUsd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup and preventing duplicate calls
  const isMountedRef = useRef(true);
  const fetchAttemptRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Active client secret (prop or fetched)
  const activeClientSecret = propClientSecret || fetchedClientSecret;
  
  // Generate stable idempotency key per payment attempt
  const idempotencyKey = useMemo(() => {
    return `pi_${productId}_${amount}_${currency}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }, [productId, amount, currency]);

  // ============================================================
  // RESET STATE ON OPEN/CLOSE
  // ============================================================
  
  useEffect(() => {
    if (isOpen) {
      // Reset for fresh start
      isMountedRef.current = true;
      setModalState('initializing');
      setError(null);
      fetchAttemptRef.current = 0;
      
      if (propClientSecret) {
        setModalState('ready');
      }
    } else {
      // Cleanup on close
      isMountedRef.current = false;
      setFetchedClientSecret(null);
      setChargeAmountUsd(null);
      setError(null);
      onClearError?.();
      
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen, propClientSecret]); 

  // ============================================================
  // SYNC EXTERNAL TRANSACTION STATE
  // ============================================================
  
  useEffect(() => {
    if (isProcessingTransaction) {
      setModalState('completing');
    }
  }, [isProcessingTransaction]);
  
  useEffect(() => {
    if (transactionError && modalState === 'completing') {
      setModalState('error');
      setError(transactionError);
    }
  }, [transactionError, modalState]);

  // ============================================================
  // FETCH PAYMENT INTENT (WITH RETRY LOGIC)
  // ============================================================
  
  const fetchPaymentIntent = useCallback(async () => {
    if (!isOpen || propClientSecret || !amount || !productId) return;
    
    // Prevent duplicate fetches
    fetchAttemptRef.current += 1;
    const currentAttempt = fetchAttemptRef.current;
    
    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setModalState('initializing');
    setError(null);
    
    try {
      const token = getAccessToken();
      
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
          currency: currency,
          productId: productId,
          type: productType,
          mobile: mobile
        })
      });
      
      // Check if component still mounted and same attempt
      if (!isMountedRef.current || currentAttempt !== fetchAttemptRef.current) return;
      
      const data: PaymentIntentResponse = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }
      
      if (!data.clientSecret) {
        throw new Error('No client secret returned');
      }
      
      // Success - update state
      setFetchedClientSecret(data.clientSecret);
      setChargeAmountUsd(data.chargeAmount);
      setModalState('ready');
      
    } catch (err: any) {
      // Ignore abort errors
      if (err.name === 'AbortError') return;
      
      // Check if still mounted
      if (!isMountedRef.current) return;
      
      console.error('[PaymentModal] Init failed:', err);
      setError(err.message || 'Failed to initialize payment. Please try again.');
      setModalState('error');
      onError?.(err.message);
    }
  }, [isOpen, propClientSecret, amount, currency, productId, productType, mobile, idempotencyKey, onError]);

  // Auto-fetch on mount
  useEffect(() => {
    if (isOpen && !propClientSecret && !fetchedClientSecret && modalState === 'initializing') {
      fetchPaymentIntent();
    }
  }, [isOpen, propClientSecret, fetchedClientSecret, modalState, fetchPaymentIntent]);

  // ============================================================
  // HANDLE PAYMENT SUBMISSION
  // ============================================================
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements || !activeClientSecret) {
      setError('Payment system not ready. Please wait.');
      return;
    }
    
    setModalState('processing');
    setError(null);
    onClearError?.();
    
    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/?payment_status=success`,
        },
        redirect: 'if_required'
      });
      
      if (!isMountedRef.current) return;
      
      if (submitError) {
        // User-facing Stripe errors
        const errorMessage = submitError.message || 'Payment failed. Please try again.';
        setError(errorMessage);
        setModalState('ready'); // Allow retry
        onError?.(errorMessage);
        return;
      }
      
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment confirmed - notify parent to complete transaction
        if (onSuccess) {
          setModalState('completing');
          onSuccess(paymentIntent.id);
        } else {
          // No handler - just close and refresh
          setModalState('success');
          setTimeout(() => {
            onClose();
            window.location.reload();
          }, 1500);
        }
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        // Payment is processing (async)
        setModalState('completing');
        if (onSuccess) {
          onSuccess(paymentIntent.id);
        }
      } else {
        // Unexpected state
        setError('Payment status unclear. Please check your account.');
        setModalState('error');
      }
      
    } catch (err: any) {
      if (!isMountedRef.current) return;
      
      console.error('[PaymentModal] Payment error:', err);
      setError(err.message || 'An unexpected error occurred');
      setModalState('error');
      onError?.(err.message);
    }
  };

  // ============================================================
  // HANDLE RETRY
  // ============================================================
  
  const handleRetry = () => {
    setError(null);
    setFetchedClientSecret(null);
    setChargeAmountUsd(null);
    onClearError?.();
    fetchPaymentIntent();
  };

  // ============================================================
  // HANDLE CLOSE (WITH CONFIRMATION)
  // ============================================================
  
  const handleClose = () => {
    if (modalState === 'processing' || modalState === 'completing') {
      // Don't allow closing during payment
      return;
    }
    onClose();
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  
  const renderPriceDisplay = () => {
    const displayAmount = chargeAmountUsd ?? amount;
    
    return (
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">
          ${displayAmount.toFixed(2)} <span className="text-lg text-gray-500">USD</span>
        </p>
        
        {/* Show local currency equivalent if different */}
        {currency !== 'USD' && chargeAmountUsd && (
          <p className="text-sm text-gray-500 mt-1">
            ≈ {amount.toLocaleString()} {currency}
          </p>
        )}
        
        {/* Recipient info */}
        <p className="text-xs text-gray-400 mt-2">
          Recharge for: <span className="font-mono">{mobile}</span>
        </p>
      </div>
    );
  };

  // ============================================================
  // RENDER - DON'T SHOW IF NOT OPEN
  // ============================================================
  
  if (!isOpen) return null;

  // ============================================================
  // RENDER - MAIN MODAL
  // ============================================================
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* ========== HEADER ========== */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Secure Payment
          </h3>
          <button 
            onClick={handleClose}
            disabled={modalState === 'processing' || modalState === 'completing'}
            className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========== CONTENT ========== */}
        <div className="p-6">
          
          {/* ---------- ERROR BANNER ---------- */}
          {(error || transactionError) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Payment Error</p>
                <p className="text-red-600">{error || transactionError}</p>
              </div>
            </div>
          )}

          {/* ---------- STATE: INITIALIZING ---------- */}
          {modalState === 'initializing' && (
            <div className="py-12 text-center">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <Lock className="absolute inset-0 m-auto w-6 h-6 text-indigo-600" />
              </div>
              <p className="text-gray-700 font-medium">Initializing Secure Checkout</p>
              <p className="text-sm text-gray-500 mt-1">Setting up encrypted payment...</p>
            </div>
          )}

          {/* ---------- STATE: ERROR (WITH RETRY) ---------- */}
          {modalState === 'error' && !activeClientSecret && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-gray-900 font-bold mb-2">Unable to Start Payment</p>
              <p className="text-sm text-gray-600 mb-6 max-w-xs mx-auto">
                {error || 'Something went wrong. Please try again.'}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ---------- STATE: COMPLETING (TRANSACTION PROCESSING) ---------- */}
          {modalState === 'completing' && (
            <div className="py-12 text-center">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-green-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                <CheckCircle className="absolute inset-0 m-auto w-6 h-6 text-green-600" />
              </div>
              <p className="text-gray-900 font-bold">Payment Received!</p>
              <p className="text-gray-600 mt-1">Completing your transaction...</p>
              <p className="text-xs text-gray-400 mt-4">Please don't close this window</p>
            </div>
          )}

          {/* ---------- STATE: SUCCESS ---------- */}
          {modalState === 'success' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-gray-900 font-bold text-xl">Payment Successful!</p>
              <p className="text-gray-600 mt-1">Redirecting...</p>
            </div>
          )}

          {/* ---------- STATE: READY (PAYMENT FORM) ---------- */}
          {(modalState === 'ready' || (modalState === 'processing') || (modalState === 'error' && activeClientSecret)) && activeClientSecret && (
            <form onSubmit={handleSubmit}>
              
              {/* Price Display */}
              {renderPriceDisplay()}
              
              {/* Stripe Payment Element */}
              <div className="mb-6">
                <PaymentElement 
                  options={{
                    layout: 'tabs',
                    paymentMethodOrder: ['card', 'apple_pay', 'google_pay']
                  }}
                />
              </div>
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={!stripe || modalState === 'processing'}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-[0.99]"
              >
                {modalState === 'processing' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    Pay ${(chargeAmountUsd ?? amount).toFixed(2)} USD
                    <ShieldCheck className="w-5 h-5 opacity-80" />
                  </>
                )}
              </button>
              
              {/* Retry button if error but form is showing */}
              {modalState === 'error' && activeClientSecret && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="w-full mt-3 py-2 text-gray-600 hover:text-gray-800 font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Start Over
                </button>
              )}
            </form>
          )}
        </div>

        {/* ========== FOOTER ========== */}
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

