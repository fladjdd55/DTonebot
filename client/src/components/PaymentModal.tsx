import React, { useEffect, useState, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, Lock, Loader2, AlertCircle } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_KEY) {
  console.error("⚠️ Stripe Publishable Key is missing! Check your .env file.");
}

const stripePromise = loadStripe(STRIPE_KEY);

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentId: string) => Promise<void>;
  amount: number;
  currency: string;
  mobile: string;
  productId: number;
  productType: string;
  transactionError?: string; // ✅ Added
  isProcessingTransaction?: boolean; // ✅ Added
}

function CheckoutForm({ 
  onSuccess, 
  isProcessingTransaction 
}: { 
  onSuccess: (id: string) => Promise<void>;
  isProcessingTransaction?: boolean; // ✅ Added
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ✅ Combined loading state
  const isLoading = isProcessing || isProcessingTransaction;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setMessage(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setMessage(submitError.message || "Please check your card details.");
        setIsProcessing(false);
        return;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, 
        },
        redirect: 'if_required', 
      });

      if (error) {
        setMessage(error.message || 'Payment failed');
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Run transaction. If it throws, we catch it below.
        await onSuccess(paymentIntent.id);
        setIsProcessing(false); 
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        setMessage("Authentication required. Please complete the security check.");
        setIsProcessing(false);
      } else {
        setMessage(`Payment status: ${paymentIntent?.status}`);
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error("Payment Error:", err);
      // This message will appear right above the "Pay Now" button
      setMessage(err.message || 'An unexpected error occurred. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {/* Internal Payment Error Display */}
      {message && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded flex items-center gap-2 border border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" /> 
          <span>{message}</span>
        </div>
      )}

      <button
        disabled={isLoading || !stripe || !elements} // ✅ Use combined loading
        id="submit"
        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
      >
        {isLoading ? ( // ✅ Show different states
          <>
            <Loader2 className="animate-spin w-4 h-4" /> 
            {isProcessingTransaction ? 'Processing Transaction...' : 'Processing Payment...'}
          </>
        ) : (
          <><Lock className="w-4 h-4" /> Pay Now</>
        )}
      </button>
    </form>
  );
}

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  amount, 
  currency, 
  mobile, 
  productId, 
  productType,
  transactionError, // ✅ Destructure
  isProcessingTransaction // ✅ Destructure
}: PaymentModalProps) {
  
  const [clientSecret, setClientSecret] = useState('');
  const [initError, setInitError] = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (isOpen && amount > 0) {
      if (fetchedRef.current) return;
      fetchedRef.current = true;

      setInitError('');
      setClientSecret('');

      fetch(`${BASE_URL}/api/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount, 
          currency, 
          mobile, 
          productId, 
          type: productType 
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to initialize payment');
          return data;
        })
        .then((data) => {
          setClientSecret(data.clientSecret);
        })
        .catch((err) => {
          console.error('Payment Intent Error:', err);
          setInitError(err.message || "Could not connect to payment server.");
          fetchedRef.current = false;
        });
    }

    if (!isOpen) {
      fetchedRef.current = false;
      setClientSecret('');
    }
  }, [isOpen, amount, currency, mobile, productId, productType]); 

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="bg-gray-50 p-4 flex justify-between items-center border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">Secure Payment</h3>
            <p className="text-xs text-gray-500">Powered by Stripe</p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isProcessingTransaction} // ✅ Prevent close during processing
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="mb-6 text-center">
            <span className="text-3xl font-bold text-gray-900">
              {amount || 0} <span className="text-lg text-gray-500">{currency}</span>
            </span>
          </div>

          {/* ✅ TRANSACTION ERROR DISPLAY */}
          {transactionError && (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-3 mb-4 border-2 border-red-200">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> 
              <div className="flex-1">
                <p className="font-semibold mb-1">Transaction Failed</p>
                <p>{transactionError}</p>
              </div>
            </div>
          )}

          {clientSecret ? (
            <Elements key={clientSecret} options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
              <CheckoutForm 
                onSuccess={onSuccess} 
                isProcessingTransaction={isProcessingTransaction} // ✅ Pass state
              />
            </Elements>
          ) : initError ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-red-600 space-y-2">
              <AlertCircle className="w-10 h-10" />
              <p className="font-medium">Payment Unavailable</p>
              <p className="text-sm text-gray-500">{initError}</p>
              <button onClick={onClose} className="mt-4 text-indigo-600 text-sm hover:underline">Close</button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-gray-400">Initializing secure checkout...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
