import { Zap, User } from 'lucide-react';

interface HomeViewProps {
  onTopupClick: () => void;
}

export default function HomeView({ onTopupClick }: HomeViewProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Welcome Back!</h1>
        <p className="text-indigo-100 mb-6">Send airtime instantly to anyone, anywhere.</p>
        <button 
          onClick={onTopupClick}
          className="w-full bg-white text-indigo-600 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors"
        >
          Start New Topup
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-green-600" />
          </div>
          <h3 className="font-bold text-gray-800">Fast Sent</h3>
          <p className="text-xs text-gray-500">Instant delivery</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-bold text-gray-800">Secure</h3>
          <p className="text-xs text-gray-500">Safe payments</p>
        </div>
      </div>
    </div>
  );
}
