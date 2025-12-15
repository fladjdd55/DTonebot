import { useState, useRef, useEffect } from 'react';
import { User, LogOut, History, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface UserMenuProps {
  onLoginClick: () => void;
  onHistoryClick: () => void;
  onProfileClick: () => void;
}

export default function UserMenu({ onLoginClick, onHistoryClick, onProfileClick }: UserMenuProps) {
  // ✅ FIX 1: 'isAuthenticated' is derived from user, not destructured
  const { user, logout } = useAuth();
  const isAuthenticated = !!user;
  
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  // Not authenticated - show login button
  if (!isAuthenticated) {
    return (
      <button
        onClick={onLoginClick}
        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors min-h-[44px] min-w-[44px]"
      >
        <User className="w-5 h-5" />
        <span className="hidden sm:inline">Sign In</span>
      </button>
    );
  }

  // Authenticated - show user menu
  const initials = user?.name 
    // ✅ FIX 2: Explicitly type 'n' as string
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg text-white transition-colors min-h-[44px]"
      >
        {/* Avatar */}
        <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        
        {/* Name (hidden on mobile) */}
        <span className="hidden sm:block text-sm font-medium max-w-[100px] truncate">
          {user?.name || user?.email?.split('@')[0]}
        </span>
        
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="font-medium text-gray-900 truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-sm text-gray-500 truncate">
              {user?.email}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => {
                onHistoryClick();
                setIsOpen(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 min-h-[48px]"
            >
              <History className="w-4 h-4 text-gray-400" />
              Transaction History
            </button>
            
            <button
              onClick={() => {
                onProfileClick();
                setIsOpen(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 min-h-[48px]"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              Account Settings
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-100 pt-1">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 active:bg-red-100 flex items-center gap-3 min-h-[48px]"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
