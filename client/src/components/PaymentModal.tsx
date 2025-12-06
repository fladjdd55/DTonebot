import React, { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, Lock, Loader2, AlertCircle } from 'lucide-react';

// 🚀 DYNAMIC URL
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
// 🔑 Load from Environment Variable (Vite)
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_KEY) {
  console.error("⚠️ Stripe Publishable Key is missing! Please add VITE_STRIPE_PUBLISHABLE_KEY to your .env file.");
}

const stripePromise = loadStripe(STRIPE_KEY);

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount: number;
  currency: string;
}

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // We handle the redirect manually or don't redirect at all for SPAs
        return_url: window.location.href, 
      },
      redirect: 'if_required', // Important: Prevents redirect if not needed (e.g. credit cards)
    });

    if (error) {
      setMessage(error.message || 'Payment failed');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(); // Trigger the actual Top-up
    } else {
      setMessage('Unexpected state');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {message && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {message}
        </div>
      )}

      <button
        disabled={isProcessing || !stripe || !elements}
        id="submit"
        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2"
      >
        {isProcessing ? <Loader2 className="animate-spin" /> : <><Lock className="w-4 h-4" /> Pay Now</>}
      </button>
    </form>
  );
}

export default function PaymentModal({ isOpen, onClose, onSuccess, amount, currency }: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    if (isOpen && amount > 0) {
      // Fetch the secret when modal opens
      fetch('http://localhost:5000/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency }),
      })
        .then((res) => res.json())
        .then((data) => setClientSecret(data.clientSecret))
        .catch((err) => console.error('Payment Intent Error:', err));
    }
  }, [isOpen, amount, currency]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* UPDATED CONTAINER CLASSES:
          - max-h-[90vh]: Limits height to 90% of viewport
          - flex flex-col: Allows splitting header and body
      */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        {/* Header (Fixed) */}
        <div className="bg-gray-50 p-4 flex justify-between items-center border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">Secure Payment</h3>
            <p className="text-xs text-gray-500">Powered by Stripe</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 overflow-y-auto">
          <div className="mb-6 text-center">
            <span className="text-3xl font-bold text-gray-900">
              {amount} <span className="text-lg text-gray-500">{currency}</span>
            </span>
          </div>

          {clientSecret ? (
            <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
              <CheckoutForm onSuccess={onSuccess} />
            </Elements>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
