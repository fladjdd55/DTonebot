import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Home, Zap, History, User, MoreHorizontal, LogIn, Phone } from 'lucide-react';

import RechargePage from './pages/dashboard/Recharge';
import AuthModal from './components/auth/AuthModal';
import ProfileSettings from './components/auth/ProfileSettings';
import TransactionHistory from './components/auth/TransactionHistory';
import { useAuth } from './contexts/AuthContext';

// Import New Pages
import VerifyEmail from './pages/auth/VerifyEmail';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// ==========================================
// 🏠 DASHBOARD LAYOUT (Your existing App logic)
// ==========================================

const HomeView = ({ onTopupClick }: { onTopupClick: () => void }) => (
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

const MoreView = ({ onLogout, user }: { onLogout: () => void, user: any }) => (
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

function Dashboard() {
  const { user, logout } = useAuth();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'home' | 'topup' | 'history' | 'profile' | 'more'>('topup');
  
  // Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  const handleTabChange = (tab: typeof activeTab) => {
    if ((tab === 'history' || tab === 'profile') && !user) {
      setAuthView('login');
      setShowAuthModal(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20"> 
      {/* HEADER */}
      <header className="bg-white shadow-sm sticky top-0 z-30 safe-top">
        <div className="flex items-center justify-center h-14">
          <div className="flex items-center gap-2 text-indigo-600">
            <Phone className="w-5 h-5 fill-current" />
            <span className="font-bold text-lg tracking-tight">RechargeBot</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-md mx-auto min-h-[calc(100vh-140px)]">
        {activeTab === 'home' && <HomeView onTopupClick={() => setActiveTab('topup')} />}
        {activeTab === 'topup' && <div className="px-4 py-6"><RechargePage /></div>}
        {activeTab === 'history' && user && <TransactionHistory isOpen={true} onClose={() => setActiveTab('home')} />}
        {activeTab === 'profile' && user && <ProfileSettings isOpen={true} onClose={() => setActiveTab('home')} />}
        {activeTab === 'more' && <MoreView onLogout={logout} user={user} />}
      </main>

      {/* NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-bottom">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto">
          <NavButton active={activeTab === 'home'} onClick={() => handleTabChange('home')} icon={<Home className="w-6 h-6" />} label="Home" />
          <NavButton active={activeTab === 'topup'} onClick={() => handleTabChange('topup')} icon={<Zap className="w-6 h-6" />} label="Topup" />
          <NavButton active={activeTab === 'history'} onClick={() => handleTabChange('history')} icon={<History className="w-6 h-6" />} label="History" />
          <NavButton active={activeTab === 'profile'} onClick={() => handleTabChange('profile')} icon={<User className="w-6 h-6" />} label="Profile" />
          <NavButton active={activeTab === 'more'} onClick={() => handleTabChange('more')} icon={<MoreHorizontal className="w-6 h-6" />} label="More" />
        </div>
      </nav>

      {/* MODALS */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialView={authView} />
    </div>
  );
}

// Helper for Nav Items
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
      <div className={`transform transition-transform ${active ? 'scale-110' : ''}`}>{icon}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ==========================================
// 🚀 MAIN APP WITH ROUTING
// ==========================================
function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}

export default App;
