import { LogIn } from 'lucide-react';

interface MoreViewProps {
  onLogout: () => void;
  user: any;
}

export default function MoreView({ onLogout, user }: MoreViewProps) {
  return (
    <div className="p-4 space-y-2">
      <h2 className="text-xl font-bold px-2 mb-4">More Options</h2>
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
        <button className="w-full text-left px-4 py-4 hover:bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <span className="font-medium text-gray-700">Help & Support</span>
        </button>
        <button className="w-full text-left px-4 py-4 hover:bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <span className="font-medium text-gray-700">Terms of Service</span>
        </button>
        <button className="w-full text-left px-4 py-4 hover:bg-gray-50 flex items-center justify-between">
          <span className="font-medium text-gray-700">Privacy Policy</span>
        </button>
      </div>
      {user && (
        <button 
          onClick={onLogout}
          className="w-full mt-6 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4 rotate-180" /> Log Out
        </button>
      )}
    </div>
  );
}
