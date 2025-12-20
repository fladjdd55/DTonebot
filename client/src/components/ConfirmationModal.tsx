import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Product } from '../services/api';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  product: Product;
  mobile: string;
  operatorName: string;
  operatorId?: number; // ✅ ADDED: Optional operator ID for logo
  amount: number;
  totalCost: number;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  product,
  mobile,
  operatorName,
  operatorId, // ✅ RECEIVE THE ID
  amount,
  totalCost
}: ConfirmationModalProps) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = `https://operator-logo.dtone.com/logo-${operatorId}-3.png`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        
        {/* Header with Close Button */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-900">Confirm Order</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          
          {/* Operator & Mobile Section */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-3 shadow-sm border border-gray-100 overflow-hidden relative">
              
              {/* ✅ LOGIC: Show Logo if ID exists, else fallback to letter */}
              {operatorId && !logoError ? (
                <img 
                  src={logoUrl}
                  alt={operatorName}
                  loading="lazy" 
                  className="w-full h-full object-contain p-1"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="text-2xl font-bold text-gray-400">
                  {operatorName.charAt(0).toUpperCase()}
                </span>
              )}
              
            </div>
            <h4 className="text-xl font-bold text-gray-900 text-center leading-tight">
              {operatorName}
            </h4>
            <div className="flex items-center gap-1 mt-1 text-gray-500 bg-gray-50 px-3 py-1 rounded-full text-sm font-mono border border-gray-100">
              {mobile}
            </div>
          </div>

          {/* Amount Details */}
          <div className="bg-indigo-50/50 rounded-xl p-4 space-y-3 border border-indigo-100/50">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Product</span>
              <span className="font-medium text-gray-900 text-right">{product.name || product.type}</span>
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t border-indigo-100">
              <span className="text-gray-500 text-sm">Recipient Gets</span>
              <span className="font-bold text-gray-900 text-lg">
                {amount} {product.currency}
              </span>
            </div>
          </div>

          {/* Total Cost Section */}
          <div className="mt-6 flex justify-between items-end mb-6">
            <span className="text-gray-500 font-medium pb-1">Total to Pay</span>
            <span className="text-3xl font-bold text-indigo-600">
              ${totalCost.toFixed(2)}
            </span>
          </div>

          {/* Action Buttons */}
          <button 
            onClick={onConfirm}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group"
          >
            Confirm & Pay
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          
        </div>
      </div>
    </div>
  );
}
