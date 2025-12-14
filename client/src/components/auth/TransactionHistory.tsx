import { useState, useEffect } from 'react';
import { X, History, Loader2, CheckCircle, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight, Phone, Calendar, DollarSign } from 'lucide-react';
import { authApi, Transaction } from '../../services/authApi';

interface TransactionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionHistory({ isOpen, onClose }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTransactions = async (pageNum: number) => {
    setIsLoading(true);
    setError('');

    const result = await authApi.getTransactions(pageNum, 10);

    if (result) {
      setTransactions(result.transactions);
      setTotalPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } else {
      setError('Failed to load transactions');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchTransactions(page);
    }
  }, [isOpen, page]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <RefreshCw className="w-3 h-3" />
            Refunded
          </span>
        );
      case 'FAILED':
      case 'REFUND_FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center safe-bottom">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in duration-300 overscroll-contain">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5" />
            <div>
              <h2 className="text-lg font-bold">Transaction History</h2>
              <p className="text-xs text-white/80">{total} total transactions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-gray-500 mt-3">Loading transactions...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <XCircle className="w-12 h-12 text-red-300" />
              <p className="text-gray-600 font-medium mt-3">{error}</p>
              <button
                onClick={() => fetchTransactions(page)}
                className="mt-4 text-indigo-600 text-sm font-medium hover:underline"
              >
                Try again
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <History className="w-12 h-12 text-gray-300" />
              <p className="text-gray-600 font-medium mt-3">No transactions yet</p>
              <p className="text-sm text-gray-400 mt-1 text-center">
                Your purchase history will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((txn) => (
                <div key={txn.id} className="p-4 hover:bg-gray-50 transition-colors">
                  {/* Mobile Card Layout */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Phone Number */}
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-mono font-medium text-gray-900">
                          {txn.mobile}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          {txn.amount.toFixed(2)} {txn.currency}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(txn.createdAt)}
                        </span>
                      </div>

                      {/* Product Type */}
                      {txn.productType && (
                        <p className="mt-1 text-xs text-gray-400">
                          {txn.productType.replace(/_/g, ' ')}
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex-shrink-0">
                      {getStatusBadge(txn.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between flex-shrink-0 bg-gray-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
