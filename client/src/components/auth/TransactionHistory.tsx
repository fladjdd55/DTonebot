import { useEffect, useState } from 'react';
import { authApi, Transaction } from '../../services/authApi';
import { Calendar, CheckCircle, XCircle, Clock, Smartphone, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionHistory({ isOpen, onClose }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        // Only pass pageNum
        const result = await authApi.getTransactions(pageNum);
        setTransactions(result.transactions);
        setTotalPages(result.pagination.pages);
      } catch (err) {
        setError('Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [isOpen, pageNum]);

  if (!isOpen) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-600 bg-green-50';
      case 'FAILED': return 'text-red-600 bg-red-50';
      case 'REFUNDED': return 'text-orange-600 bg-orange-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="w-4 h-4" />;
      case 'FAILED': return <XCircle className="w-4 h-4" />;
      case 'REFUNDED': return <RefreshCw className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && transactions.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 bg-red-50 rounded-xl">
              <p>{error}</p>
              <button onClick={() => setPageNum(1)} className="mt-2 text-sm underline">Try Again</button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No transactions found.</div>
          ) : (
            <div className="space-y-3">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${getStatusColor(txn.status)}`}>
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{txn.mobile}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(txn.createdAt).toLocaleDateString()}
                        <Clock className="w-3 h-3 ml-1" />
                        {new Date(txn.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{txn.amount.toFixed(2)} {txn.currency}</p>
                    <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${getStatusColor(txn.status)}`}>
                      {getStatusIcon(txn.status)}
                      {txn.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer / Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t bg-gray-50 flex justify-center items-center gap-4">
            <button
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              disabled={pageNum === 1}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-gray-600">Page {pageNum} of {totalPages}</span>
            <button
              onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
              disabled={pageNum === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
