import { useState } from 'react';
import { Phone } from 'lucide-react';
import RechargePage from './pages/dashboard/Recharge';
import UserMenu from './components/auth/UserMenu';
import AuthModal from './components/auth/AuthModal';
import ProfileSettings from './components/auth/ProfileSettings';
import TransactionHistory from './components/auth/TransactionHistory';

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleLoginClick = () => {
    setAuthTab('login');
    setShowAuthModal(true);
  };

  return (
    <div className="min-h-screen-safe bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-blue-600 shadow-lg safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 min-h-[64px]">
            {/* Logo */}
            <div className="flex items-center gap-2 text-white">
              <Phone className="w-6 h-6" />
              <span className="font-bold text-xl">RechargeBot</span>
            </div>

            {/* User Menu */}
            <UserMenu
              onLoginClick={handleLoginClick}
              onHistoryClick={() => setShowHistory(true)}
              onProfileClick={() => setShowProfile(true)}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <RechargePage />
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialTab={authTab}
      />

      {/* Profile Settings Modal */}
      <ProfileSettings
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

      {/* Transaction History Modal */}
      <TransactionHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}

export default App;
