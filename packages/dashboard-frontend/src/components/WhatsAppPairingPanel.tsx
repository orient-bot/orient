import { useEffect, useState, useRef } from 'react';
import { saveWhatsAppAdminPhone } from '../api';

interface WhatsAppQrStatus {
  needsQrScan: boolean;
  isConnected: boolean;
  qrCode?: string | null;
  qrDataUrl?: string | null;
  updatedAt?: string;
  adminPhone?: string | null;
}

interface WhatsAppPairingPanelProps {
  onConnected?: () => void;
}

export default function WhatsAppPairingPanel({ onConnected }: WhatsAppPairingPanelProps) {
  const [status, setStatus] = useState<WhatsAppQrStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'qr' | 'pairing'>('qr');
  const [phonePrefix, setPhonePrefix] = useState('+');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  
  // Phone confirmation state (shown after QR pairing)
  const [needsPhoneConfirmation, setNeedsPhoneConfirmation] = useState(false);
  const [confirmPhonePrefix, setConfirmPhonePrefix] = useState('+');
  const [confirmPhoneNumber, setConfirmPhoneNumber] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneConfirmError, setPhoneConfirmError] = useState<string | null>(null);
  // Check localStorage for recently saved phone (survives page refresh)
  const [phoneConfirmSuccess, setPhoneConfirmSuccess] = useState(() => {
    const saved = localStorage.getItem('whatsapp_phone_saved');
    if (saved) {
      // Clear after 5 minutes (the server should have restarted by then)
      const savedTime = parseInt(saved, 10);
      if (Date.now() - savedTime < 5 * 60 * 1000) {
        return true;
      }
      localStorage.removeItem('whatsapp_phone_saved');
    }
    return false;
  });

  // Use refs to avoid infinite loops
  const wasConnectedRef = useRef<boolean | null>(null);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  
  // Track if phone was entered via pairing code (so we can auto-save it)
  const pairingPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let isFirstFetch = true;

    const fetchStatus = async () => {
      try {
        const response = await fetch('/qr/status', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`QR status failed: ${response.status}`);
        }
        const data = await response.json() as WhatsAppQrStatus;

        if (!isMounted) return;

        setStatus(data);
        setError(null);
        setIsLoading(false);

        // Handle phone confirmation logic
        const justConnected = data.isConnected && wasConnectedRef.current === false;
        const initiallyConnectedWithoutPhone = isFirstFetch && data.isConnected && !data.adminPhone;
        
        // Check if phone was recently saved (localStorage persists across refresh)
        const recentlySavedPhone = localStorage.getItem('whatsapp_phone_saved');
        const hasRecentSave = recentlySavedPhone && (Date.now() - parseInt(recentlySavedPhone, 10) < 5 * 60 * 1000);
        
        if (justConnected || initiallyConnectedWithoutPhone) {
          // Just connected OR first load while already connected without phone
          if (pairingPhoneRef.current) {
            // Phone was entered via pairing code - auto-save it
            const phoneToSave = pairingPhoneRef.current;
            pairingPhoneRef.current = null;
            try {
              await saveWhatsAppAdminPhone(phoneToSave);
              setPhoneConfirmSuccess(true);
              localStorage.setItem('whatsapp_phone_saved', Date.now().toString());
            } catch (err) {
              // Failed to save, show confirmation form
              setNeedsPhoneConfirmation(true);
              setConfirmPhonePrefix('+');
              setConfirmPhoneNumber(phoneToSave.slice(3)); // Remove country code prefix
            }
          } else if (!data.adminPhone && !hasRecentSave) {
            // QR code pairing or initial load without phone - need to ask for phone
            // But don't ask if we just saved recently (server may not have restarted yet)
            setNeedsPhoneConfirmation(true);
          }
          
          if (justConnected) {
            onConnectedRef.current?.();
          }
        }
        
        // Clear localStorage flag once server has the phone configured
        if (data.adminPhone && recentlySavedPhone) {
          localStorage.removeItem('whatsapp_phone_saved');
        }
        
        wasConnectedRef.current = data.isConnected;
        isFirstFetch = false;
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
        setStatus(null);
        setIsLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []); // Empty deps - fetch on mount and poll

  const retryFetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/qr/status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`QR status failed: ${response.status}`);
      }
      const data = await response.json() as WhatsAppQrStatus;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPairingCode = async () => {
    const prefix = phonePrefix.replace(/[^0-9]/g, '');
    const number = phoneNumber.replace(/[^0-9]/g, '');
    const fullNumber = prefix + number;

    if (fullNumber.length < 10 || fullNumber.length > 15) {
      setPairingError('Please enter a valid phone number (10-15 digits with country code)');
      return;
    }

    setIsPairingLoading(true);
    setPairingError(null);

    try {
      const response = await fetch('/qr/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullNumber }),
      });

      const data = await response.json();

      if (data.success) {
        setPairingCode(data.formattedCode || data.code);
        // Store the phone number to auto-save after successful pairing
        pairingPhoneRef.current = fullNumber;
      } else {
        setPairingError(data.error || 'Failed to get pairing code');
      }
    } catch (err) {
      setPairingError('Network error. Please try again.');
    } finally {
      setIsPairingLoading(false);
    }
  };

  const savePhoneConfirmation = async () => {
    const prefix = confirmPhonePrefix.replace(/[^0-9]/g, '');
    const number = confirmPhoneNumber.replace(/[^0-9]/g, '');
    const fullNumber = prefix + number;

    if (fullNumber.length < 10 || fullNumber.length > 15) {
      setPhoneConfirmError('Please enter a valid phone number (10-15 digits with country code)');
      return;
    }

    setIsSavingPhone(true);
    setPhoneConfirmError(null);

    try {
      await saveWhatsAppAdminPhone(fullNumber);
      setPhoneConfirmSuccess(true);
      setNeedsPhoneConfirmation(false);
      // Persist to localStorage so page refresh doesn't ask again
      localStorage.setItem('whatsapp_phone_saved', Date.now().toString());
    } catch (err) {
      setPhoneConfirmError(err instanceof Error ? err.message : 'Failed to save phone number');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const skipPhoneConfirmation = () => {
    setNeedsPhoneConfirmation(false);
  };

  const handleFactoryReset = async () => {
    if (!confirm('FACTORY RESET will:\n\n• Clear ALL session data locally\n• Require a completely fresh pairing\n\nThis is the nuclear option for fixing pairing issues. Continue?')) {
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch('/qr/factory-reset', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setPairingCode(null);
        wasConnectedRef.current = false;
      } else {
        alert('Factory reset failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Factory reset failed. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleFlushSession = async () => {
    if (!confirm('This will disconnect WhatsApp and require re-pairing. Continue?')) {
      return;
    }

    try {
      const response = await fetch('/qr/flush-session', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setPairingCode(null);
        wasConnectedRef.current = false;
      } else {
        alert('Failed to flush session: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to flush session. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
        <div className="text-sm text-muted-foreground mb-3">
          WhatsApp QR service is unavailable
        </div>
        <p className="text-xs text-muted-foreground">
          Start the WhatsApp bot and try again.
        </p>
        <button
          type="button"
          onClick={retryFetch}
          className="btn btn-secondary h-8 mt-4"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Checking WhatsApp status...</span>
        </div>
      </div>
    );
  }

  // Connected state
  if (status?.isConnected) {
    // Show phone confirmation form if needed (after QR scan)
    if (needsPhoneConfirmation) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground text-center mb-1">Connected!</p>
          <p className="text-xs text-muted-foreground text-center mb-4">
            Please confirm your phone number for admin configuration
          </p>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={confirmPhonePrefix}
                onChange={(e) => setConfirmPhonePrefix(e.target.value)}
                placeholder="+1"
                maxLength={5}
                className="input w-16 text-center font-mono"
              />
              <input
                type="tel"
                value={confirmPhoneNumber}
                onChange={(e) => setConfirmPhoneNumber(e.target.value)}
                placeholder="501234567"
                maxLength={15}
                className="input flex-1 font-mono"
                onKeyPress={(e) => e.key === 'Enter' && savePhoneConfirmation()}
              />
            </div>
            
            {phoneConfirmError && (
              <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {phoneConfirmError}
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={savePhoneConfirmation}
                disabled={isSavingPhone}
                className="btn btn-primary h-9 flex-1"
              >
                {isSavingPhone ? 'Saving...' : 'Save Phone Number'}
              </button>
              <button
                type="button"
                onClick={skipPhoneConfirmation}
                className="btn btn-ghost h-9"
              >
                Skip
              </button>
            </div>
            
            <p className="text-[10px] text-muted-foreground text-center">
              This phone number is used for admin configuration and bot identification.
            </p>
          </div>
        </div>
      );
    }
    
    // Normal connected state
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Connected</p>
        <p className="text-xs text-muted-foreground mb-1">WhatsApp bot is ready and running</p>
        
        {phoneConfirmSuccess ? (
          <div className="mb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-medium text-emerald-600">Phone number saved</span>
            </div>
          </div>
        ) : status.adminPhone ? (
          <p className="text-xs text-muted-foreground mb-4 font-mono">
            Admin: +{status.adminPhone.replace(/(\d{3})(\d+)/, '$1***')}
          </p>
        ) : (
          <div className="mb-4">
            <p className="text-xs text-amber-600 mb-2">Admin phone not configured</p>
            <button
              type="button"
              onClick={() => setNeedsPhoneConfirmation(true)}
              className="btn btn-secondary h-8 text-xs"
            >
              Set Admin Phone
            </button>
          </div>
        )}
        
        <button
          type="button"
          onClick={handleFlushSession}
          className="btn h-8 text-xs bg-transparent border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          Disconnect & Reconnect
        </button>
      </div>
    );
  }

  // Pairing state
  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2 py-3 border-b border-border">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="font-mono text-xs font-medium text-amber-500">
          {status?.qrDataUrl ? 'Waiting for pairing...' : 'Generating QR code...'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-3 pb-0">
        <div className="flex gap-1 p-1 bg-secondary rounded-lg border border-border w-full">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'qr'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            QR Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pairing')}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'pairing'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Pairing Code
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'qr' && (
          <div className="flex flex-col items-center">
            {/* QR Code display */}
            <div className="p-4 bg-white rounded-lg border border-border mb-4">
              {status?.qrDataUrl ? (
                <img
                  src={status.qrDataUrl}
                  alt="WhatsApp QR Code"
                  className="w-48 h-48 rounded"
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center bg-muted rounded text-muted-foreground">
                  <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin mb-2" />
                  <span className="text-xs">Loading QR code...</span>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="w-full rounded-lg bg-muted/50 border border-border p-3 text-left">
              <p className="text-xs font-medium text-foreground mb-2">How to connect</p>
              <ol className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">1</span>
                  Open WhatsApp on your phone
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">2</span>
                  Go to <strong className="text-foreground font-medium">Settings → Linked Devices</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">3</span>
                  Tap <strong className="text-foreground font-medium">Link a Device</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">4</span>
                  Point your camera at this QR code
                </li>
              </ol>
            </div>

            <p className="font-mono text-[10px] text-muted-foreground mt-3">
              Auto-refreshing every <code className="bg-border px-1 py-0.5 rounded">3s</code> · QR expires in ~60s
            </p>
          </div>
        )}

        {activeTab === 'pairing' && (
          <div>
            {!pairingCode ? (
              <>
                <p className="text-xs text-muted-foreground mb-3 text-center">
                  Enter your phone number to receive an 8-character pairing code
                </p>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={phonePrefix}
                    onChange={(e) => setPhonePrefix(e.target.value)}
                    placeholder="+1"
                    maxLength={5}
                    className="input w-16 text-center font-mono"
                  />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="501234567"
                    maxLength={15}
                    className="input flex-1 font-mono"
                    onKeyPress={(e) => e.key === 'Enter' && requestPairingCode()}
                  />
                </div>
                <button
                  type="button"
                  onClick={requestPairingCode}
                  disabled={isPairingLoading}
                  className="btn btn-primary h-9 w-full"
                >
                  {isPairingLoading ? 'Requesting...' : 'Get Pairing Code'}
                </button>
                {pairingError && (
                  <div className="mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                    {pairingError}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg bg-muted border border-border p-4 text-center mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                    Your pairing code
                  </p>
                  <p className="font-mono text-2xl font-semibold tracking-widest text-foreground">
                    {pairingCode}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter this code in WhatsApp
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPairingCode(null)}
                  className="btn btn-secondary h-8 w-full text-xs"
                >
                  Try Different Number
                </button>
              </>
            )}

            {/* Instructions */}
            <div className="mt-4 rounded-lg bg-muted/50 border border-border p-3 text-left">
              <p className="text-xs font-medium text-foreground mb-2">How to connect with code</p>
              <ol className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">1</span>
                  Open WhatsApp on your phone
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">2</span>
                  Go to <strong className="text-foreground font-medium">Settings → Linked Devices</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">3</span>
                  Tap <strong className="text-foreground font-medium">Link with phone number instead</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 flex-shrink-0 rounded-full bg-border flex items-center justify-center text-[10px] font-medium text-foreground">4</span>
                  Enter the 8-character code shown above
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Factory reset section */}
      <div className="px-4 pb-4">
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground mb-2">
            Having trouble pairing? Stuck on "Logging In..."? Try a reset.
          </p>
          <button
            type="button"
            onClick={handleFactoryReset}
            disabled={isResetting}
            className="btn h-8 w-full text-xs bg-transparent border border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            {isResetting ? 'Resetting...' : 'Factory Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
