import { useState, useEffect } from 'react';
import { login, assetUrl } from '../api';

interface LoginFormProps {
  onSuccess: (username: string) => void;
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // Check for redirect parameter in URL (used when redirected from OpenCode)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
      setRedirectUrl(redirect);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(username, password);

      // If there's a redirect URL, navigate to it after successful login
      if (redirectUrl) {
        // Small delay to ensure cookie is set
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
      } else {
        onSuccess(result.username);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-100">
      <div className="card relative p-8 w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          {/* Ori Mascot - Welcoming */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-32 h-32 bg-card rounded-full flex items-center justify-center p-4 shadow-xl">
            <img
              src={assetUrl('/mascot/variations/welcome.png')}
              alt="Ori the Orient mascot"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl font-semibold text-surface-900 mt-2">Welcome back!</h1>
          <p className="text-sm text-surface-500 mt-1">Sign in to manage your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {redirectUrl && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm animate-fade-in">
              Please sign in to access OpenCode
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-surface-700 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-surface-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-2.5">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="spinner !w-4 !h-4 !border-white/30 !border-t-white" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
