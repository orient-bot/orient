import { useState, useEffect } from 'react';
import { setup, assetUrl, signInWithGoogle } from '../api';
import { GoogleIcon } from './GoogleIcon';

interface SetupFormProps {
  onSuccess: (username: string) => void;
}

export default function SetupForm({ onSuccess }: SetupFormProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await setup(username, password);

      // If there's a redirect URL, navigate to it after successful setup
      if (redirectUrl) {
        // Small delay to ensure cookie is set
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
      } else {
        onSuccess(username);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await signInWithGoogle();

      // If there's a redirect URL, navigate to it after successful setup
      if (redirectUrl) {
        // Small delay to ensure cookie is set
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
      } else {
        onSuccess(result.username);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="card p-8 w-full max-w-sm animate-fade-in border-border shadow-lg">
        <div className="text-center mb-8">
          <img
            src={assetUrl('/mascot/variations/setup-helper.png')}
            alt="Ori the mascot ready to help with setup"
            className="w-24 h-24 mx-auto mb-4 object-contain drop-shadow-md"
          />
          <h1 className="text-xl font-semibold">Workspace setup</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your admin account to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1.5">
              Admin Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="Enter admin username"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Min. 8 characters"
              required
              minLength={8}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Re-enter password"
              required
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-2.5">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Creating account...
              </span>
            ) : (
              'Create Admin Account'
            )}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted-foreground">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="btn btn-secondary w-full py-2.5 flex items-center justify-center gap-2"
          >
            <GoogleIcon />
            Sign up with Google
          </button>
        </form>

        <div className="mt-6 p-3 bg-muted/50 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground text-center">
            This is a one-time setup. Your credentials will be securely stored.
          </p>
        </div>
      </div>
    </div>
  );
}
