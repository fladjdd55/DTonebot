import React, { useState } from 'react'; // Added React for ReactNode types
import { Home, Zap, History, User, MoreHorizontal, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// Components
import RechargePage from './Recharge'; // Path relative to this file
import TransactionHistory from '../../components/auth/TransactionHistory';
import ProfileSettings from '../../components/auth/ProfileSettings';
import AuthModal from '../../components/auth/AuthModal';
import HomeView from '../../components/dashboard/HomeView';
import MoreView from '../../components/dashboard/MoreView';

// Helper for Nav Items (Moved from App.tsx)
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
      <div className={`transform transition-transform ${active ? 'scale-110' : ''}`}>{icon}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

export default function DashboardLayout() {
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
