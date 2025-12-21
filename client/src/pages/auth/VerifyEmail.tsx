import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom'; // ✅ This import was missing
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { authApi } from '../../services/authApi';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold">Verifying...</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Email Verified!</h2>
            <p className="text-gray-600 mb-6">Your account is now active.</p>
            <button onClick={() => navigate('/')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold w-full">
              Go to Dashboard
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-6">The link is invalid or expired.</p>
            <button onClick={() => navigate('/')} className="bg-gray-800 text-white px-6 py-2 rounded-lg font-bold w-full">
              Back Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
