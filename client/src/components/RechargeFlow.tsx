import  { useState } from 'react';
import { Phone, AlertCircle } from 'lucide-react';

// Hooks & Utils
import { useCountries } from '../hooks/useCountries';
import { useOperators } from '../hooks/useOperators';
import { useProducts } from '../hooks/useProducts';
import { formatPhoneNumber, extractDigits, validatePhoneNumber } from '../../shared/phoneValidator';
import { rechargeApi } from '../services/api';

// Sub-Components
import CountryPhoneStep from './recharge/CountryPhoneStep';
import OperatorStep from './recharge/OperatorStep';
import ProductStep from './recharge/ProductStep';
import ReceiptStep from './recharge/ReceiptStep'; // (Assume standard receipt UI)
import PaymentModal from './PaymentModal';
import ConfirmationModal from './ConfirmationModal';

export default function RechargeFlow() {
  // --- STATE ---
  const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [validationState, setValidationState] = useState<any>(null);
  
  const [operator, setOperator] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Modals & Transactions
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txnResult, setTxnResult] = useState<any>(null);

  // --- HOOKS ---
  const { countries, loading: cLoading, usingFallback } = useCountries();
  const { operators, usingFallback: opFallback } = useOperators(selectedCountry?.iso3);
  const { products, loading: pLoading } = useProducts(operator?.operatorId);

  // --- HANDLERS ---
  
  // Step 1: Input & Validation
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCountry) return;
    const raw = e.target.value;
    const code = selectedCountry.code;
    const formatted = raw.length < phoneNumber.length ? raw : formatPhoneNumber(raw, code as any);
    setPhoneNumber(formatted);
    setValidationState(validatePhoneNumber(extractDigits(formatted), code as any));
    setError('');
  };

  // Step 1 -> 1.5: Lookup Operator
  const handleLookup = async () => {
    setLoading(true);
    try {
      const full = validationState.fullNumber || `+${extractDigits(phoneNumber)}`;
      const op = await rechargeApi.lookup(full);
      setOperator(op);
      setStep(1.5);
    } catch (err) {
      setError('Could not auto-detect operator. Please select manually.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualOperator = (op: any) => {
    setOperator({ operatorId: op.id, operatorName: op.name, countryIso: selectedCountry.code });
    setStep(1.5);
    setError('');
  };

  // Step 2 -> Payment: Prepare Transaction
  const handlePurchaseInit = async (product: any, customAmount?: number) => {
    setLoading(true);
    try {
      // 1. Calculate Price on Server
      const intent = await rechargeApi.createPaymentIntent({
        productId: product.id,
        mobile: validationState.fullNumber,
        countryCode: selectedCountry.code, // ✅ SECURITY: Sending Country Code now!
        customAmount
      });
      
      setPendingPurchase({ product, customAmount, intent });
      setShowConfirmModal(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Execute Payment Success
  const handlePaymentSuccess = async (paymentId: string) => {
    // 1. Tell the user we are working
    if (!pendingPurchase) return;
    
    try {
      // 2. Call the Real Backend API
      let result = await rechargeApi.purchase(
        pendingPurchase.product.id,
        validationState.fullNumber,
        pendingPurchase.customAmount || parseFloat(pendingPurchase.product.amount),
        'USD',
        pendingPurchase.product.type,
        paymentId
      );

      // 3. Self-Healing: If PENDING, poll for status
      if (result.success && result.dbStatus === 'PENDING') {
         const MAX_RETRIES = 15;
         let retries = 0;
         while (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000));
            const update = await rechargeApi.checkStatus(paymentId);
            if (update.status === 'COMPLETED' || update.status === 'FAILED') {
               result = { ...result, ...update };
               break;
            }
            retries++;
         }
      }

      // 4. Handle Success/Fail
      if (!result.success) {
        setError(`Transaction Failed: ${result.message}`);
        return;
      }

      setTxnResult(result);
      setShowPayModal(false);
      setStep(3); // Show Receipt

    } catch (err: any) {
      setError(err.message || 'Transaction processing failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4 pt-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden h-fit">
        
        {/* Header */}
        <div className="bg-indigo-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6" />
            <h1 className="text-xl font-bold">Mobile Recharge</h1>
          </div>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}

          {step === 1 && (
            <CountryPhoneStep 
              countries={countries}
              selectedCountry={selectedCountry}
              phoneNumber={phoneNumber}
              validationState={validationState}
              loading={loading || cLoading}
              usingFallback={usingFallback}
              operatorsFallback={opFallback}
              availableOperators={operators}
              onCountrySelect={setSelectedCountry}
              onClearCountry={() => { setSelectedCountry(null); setPhoneNumber(''); }}
              onPhoneChange={handlePhoneChange}
              onSubmit={handleLookup}
              onManualSelect={handleManualOperator}
            />
          )}

          {step === 1.5 && operator && (
            <OperatorStep 
              operator={operator}
              onConfirm={() => setStep(2)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 2 && (
            <ProductStep 
              products={products}
              loading={pLoading}
              onPurchase={handlePurchaseInit}
              onChangeOperator={() => setStep(1)}
              operatorName={operator.operatorName}
            />
          )}

          {step === 3 && txnResult && (
             <ReceiptStep 
                result={txnResult}
                mobile={validationState?.fullNumber}
                onReset={() => { setStep(1); setPhoneNumber(''); }}
             />
          )}
        </div>
      </div>

      {/* Modals */}
      {showConfirmModal && pendingPurchase && (
        <ConfirmationModal 
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={() => { setShowConfirmModal(false); setShowPayModal(true); }}
          product={pendingPurchase.product}
          amount={pendingPurchase.intent.localAmount}
          totalCost={pendingPurchase.intent.chargeAmount}
          mobile={validationState?.fullNumber}
          operatorName={operator?.operatorName}
        />
      )}

      {showPayModal && pendingPurchase && (
        <PaymentModal 
           isOpen={showPayModal}
           onClose={() => setShowPayModal(false)}
           clientSecret={pendingPurchase.intent.clientSecret}
           amount={pendingPurchase.intent.chargeAmount}
           currency="USD"
           mobile={validationState?.fullNumber}
           productId={pendingPurchase.product.id}
           countryCode={selectedCountry.code} // ✅ Pass to Payment Modal
           onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
