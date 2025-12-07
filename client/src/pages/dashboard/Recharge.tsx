import RechargeFlow from '../../components/RechargeFlow';

export default function RechargePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Mobile Top-up
        </h1>
        <p className="text-gray-500">
          Send airtime to over 160 countries instantly.
        </p>
      </div>

      {/* Main Content: The Flow Component */}
      <div className="mt-4">
        <RechargeFlow />
      </div>
    </div>
  );
}
