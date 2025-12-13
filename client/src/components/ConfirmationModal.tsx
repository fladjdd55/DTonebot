import { X, CheckCircle, Phone, Package, DollarSign, AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  product: {
    id: number;
    name: string;
    amount: string;
    currency: string;
    type: string;
    description?: string;
  } | null;
  mobile: string;
  operatorName: string;
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  product,
  mobile,
  operatorName
}: ConfirmationModalProps) => {
  if (!isOpen || !product) return null;

  const price = product.amount.split(' ')[0];
  const currency = product.amount.split(' ')[1] || product.currency;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Confirm Your Purchase</h3>
              <p className="text-sm text-white/80">Review details before payment</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Product Details */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Product
                </p>
                <p className="font-bold text-gray-900">{product.name}</p>
                {product.description && (
                  <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Recipient
                </p>
                <p className="font-bold text-gray-900">{mobile}</p>
                <p className="text-sm text-gray-600">{operatorName}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Amount
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {price} <span className="text-lg text-gray-500">{currency}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Important Notice */}
          <div className="flex gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Please verify the details</p>
              <p className="text-blue-700">
                Make sure the phone number and amount are correct. This transaction cannot be reversed once completed.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 space-y-3">
          <button
            onClick={onConfirm}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-3 rounded-lg font-bold hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
          >
            Confirm & Proceed to Payment
          </button>
          <button
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
