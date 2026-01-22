import { Navigate, useLocation } from 'react-router-dom';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { ROUTES } from '../routes';
import { Link } from 'react-router-dom';

interface ProtectedRouteProps {
  flagId: string;
  redirectTo?: string;
  children: React.ReactNode;
}

export function ProtectedRoute({
  flagId,
  redirectTo = ROUTES.WHATSAPP_CHATS,
  children,
}: ProtectedRouteProps) {
  const { isEnabled, shouldNotify, loading } = useFeatureFlags();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isEnabled(flagId)) {
    // Show notification page if strategy is 'notify'
    if (shouldNotify(flagId)) {
      return (
        <div className="max-w-2xl mx-auto p-8">
          <div className="card p-8 text-center">
            <svg
              className="mx-auto h-12 w-12 text-muted-foreground mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-2xl font-semibold mb-2">Feature Not Available</h2>
            <p className="text-muted-foreground mb-6">
              This feature is currently disabled. To enable it, contact your administrator or enable
              the feature flag in Settings.
            </p>
            <Link to={ROUTES.SETTINGS} className="btn btn-primary">
              Go to Settings
            </Link>
          </div>
        </div>
      );
    }

    // Otherwise redirect to safe page
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
