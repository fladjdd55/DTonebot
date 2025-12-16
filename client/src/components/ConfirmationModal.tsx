import { X, ArrowRight, ShieldCheck } from 'lucide-react';
import type { Product } from '../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  product: Product;
  mobile: string;
  operatorName: string;
  amount: number;      // Face Value (e.g., 500 HTG)
  totalCost: number;   // USD Cost (e.g., $5.75)
}

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  product, 
  mobile, 
  operatorName,
  amount,
  totalCost 
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-900">Confirm Transaction</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Operator Info */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xl">
              {operatorName.charAt(0)}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Operator</p>
              <p className="font-bold text-gray-900">{operatorName}</p>
            </div>
          </div>

          {/* Transfer Details */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Mobile Number</span>
              <span className="font-mono font-medium text-gray-900">{mobile}</span>
            </div>
            <div className="h-px bg-gray-200 w-full"></div>
            
            {/* Recipient Gets */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Recipient Gets</span>
              <span className="font-bold text-gray-900 text-lg">
                {amount} {product.currency}
              </span>
            </div>

            {/* You Pay */}
            <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-lg -mx-1">
              <span className="text-sm text-indigo-700 font-medium">You Pay</span>
              <span className="font-bold text-indigo-700 text-lg">
                ${totalCost.toFixed(2)} USD
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5" />
            <p>Please verify the mobile number. Top-ups are instant and cannot be reversed once sent.</p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={onClose}
              className="py-3 px-4 rounded-xl border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              className="py-3 px-4 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
            >
              Confirm <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
