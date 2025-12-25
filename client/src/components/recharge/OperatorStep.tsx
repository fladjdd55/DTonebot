import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface Props {
  operator: { operatorId: number; operatorName: string; countryIso: string };
  onConfirm: () => void;
  onBack: () => void;
}

export default function OperatorStep({ operator, onConfirm, onBack }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
      <div className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-100 shadow-sm">
        <p className="text-sm text-indigo-600 font-semibold uppercase tracking-wider mb-4">Operator Detected</p>
        <div className="flex flex-col items-center justify-center gap-3">
          {!imgError ? (
            <img 
              src={`https://operator-logo.dtone.com/logo-${operator.operatorId}-3.png`}
              alt={operator.operatorName}
              className="h-16 w-auto object-contain mb-2 drop-shadow-sm"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mb-2 shadow-md">
              <span className="text-white font-bold text-2xl">{operator.operatorName.charAt(0)}</span>
            </div>
          )}
          <div className="text-2xl font-bold text-gray-900">{operator.operatorName}</div>
        </div>
      </div>
      
      <div className="space-y-3">
        <button
          onClick={onConfirm}
          className="w-full bg-indigo-600 text-white py-3.5 rounded-lg font-bold hover:bg-indigo-700 flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
        >
          Confirm & View Plans <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="w-full text-gray-500 py-2 hover:text-gray-700 text-sm font-medium transition-colors">
          Incorrect Operator? Go Back
        </button>
      </div>
    </div>
  );
}
