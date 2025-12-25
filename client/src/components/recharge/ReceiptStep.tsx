import React from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  result: {
    status: string;
    id: string;
    externalId?: string;
    operatorName?: string;
  };
  mobile: string;
  onReset: () => void;
}

export default function ReceiptStep({ result, mobile, onReset }: Props) {
  return (
    <div className="text-center py-8 animate-in zoom-in-95 duration-300">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Top-up Successful!</h2>
      <p className="text-gray-500 mb-8">Your transaction has been processed.</p>
      
      <div className="bg-gray-50 p-5 rounded-xl text-left text-sm space-y-4 border border-gray-100 shadow-inner">
        
        <div className="flex justify-between items-center">
          <span className="text-gray-500 font-medium">Mobile Number</span>
          <span className="font-bold text-gray-900 font-mono text-base">{mobile}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-500 font-medium">Status</span>
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide">
            {result.status || 'COMPLETED'}
          </span>
        </div>

        <div className="border-t border-gray-200 my-2"></div>

        <div className="flex flex-col gap-1 group cursor-pointer" onClick={() => navigator.clipboard.writeText(result.externalId || result.id)}>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Transaction ID</span>
            <Copy className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />
          </div>
          <span className="font-mono text-gray-600 text-xs break-all">
            {result.externalId || result.id}
          </span>
        </div>
        
      </div>
      
      <button 
        onClick={onReset} 
        className="w-full mt-8 bg-gray-900 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-gray-200 transition-all hover:bg-black hover:scale-[1.01] active:scale-[0.99]"
      >
        Send Another Top-up
      </button>
    </div>
  );
}
