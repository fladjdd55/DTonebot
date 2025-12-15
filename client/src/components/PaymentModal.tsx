import { useEffect, useState } from 'react';
import { X, ShieldCheck, CreditCard } from 'lucide-react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

// ✅ FIX: Updated interface to match RechargeFlow usage
interface Props {
  isOpen: boolean;
  onClose: () => void;
  clientSecret?: string; // Optional (auto-fetched if missing)
  amount: number;
  currency: string;
  mobile: string;
  
  // Changed from 'product' object to IDs
  productId: number;
  productType?: string;
  
  // Callbacks & Error Handling
  onSuccess?: (paymentId: string) => void;
  transactionError?: string;
  isProcessingTransaction?: boolean;
  onClearError?: () => void;
}

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
  transactionError,
  isProcessingTransaction,
  onClearError
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  
  const [fetchedClientSecret, setFetchedClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Use either the prop secret or the fetched one
  const activeClientSecret = propClientSecret || fetchedClientSecret;

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setProcessing(false);
      setFetchedClientSecret(null);
      if (onClearError) onClearError();
    }
  }, [isOpen]);

  // Auto-Fetch Secret if missing
  useEffect(() => {
    if (isOpen && !propClientSecret && !fetchedClientSecret && amount && productId) {
       fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customAmount: amount, 
            currency: 'USD',
            productId: productId,
            type: productType,
            mobile: mobile
          })
       })
       .then(res => res.json())
       .then(data => {
         if (data.error) throw new Error(data.error);
         setFetchedClientSecret(data.clientSecret);
       })
       .catch(err => setError(err.message || 'Failed to initialize payment'));
    }
  }, [isOpen, propClientSecret, fetchedClientSecret, amount, productId, productType, mobile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);
    if (onClearError) onClearError();

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/?status=success`,
      },
      redirect: 'if_required' 
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // ✅ Payment Succeeded -> Call Parent
      if (onSuccess) {
        onSuccess(paymentIntent.id);
      } else {
        onClose();
        window.location.reload();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Secure Payment
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Global/Transaction Errors */}
        {(transactionError || error) && (
          <div className="mx-6 mt-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
            <X className="w-4 h-4" /> {transactionError || error}
          </div>
        )}

        {isProcessingTransaction ? (
           <div className="p-10 text-center">
             <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
             <p className="text-gray-600 font-medium">Finalizing Transaction...</p>
             <p className="text-sm text-gray-400">Please do not close this window</p>
           </div>
        ) : !activeClientSecret ? (
           <div className="p-10 text-center">
             <div className="w-8 h-8 border-4 border-gray-300 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
             <p className="mt-4 text-gray-500">Initializing secure checkout...</p>
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-1">Total Amount</p>
              {/* ✅ FIX: Used currency prop */}
              <p className="text-3xl font-bold text-gray-900">${amount.toFixed(2)} {currency || 'USD'}</p>
            </div>

            <PaymentElement />

            <button
              type="submit"
              disabled={!stripe || processing}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processing ? 'Processing...' : `Pay Now`}
              {!processing && <ShieldCheck className="w-4 h-4 opacity-80" />}
            </button>
          </form>
        )}
        
        <div className="bg-gray-50 p-3 text-center text-xs text-gray-400 border-t">
          <p>Payments processed securely by Stripe. SSL Encrypted.</p>
        </div>
      </div>
    </div>
  );
}
