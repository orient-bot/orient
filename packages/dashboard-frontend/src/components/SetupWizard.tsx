import { useMemo, useState } from 'react';
import { applySetup, assetUrl, type SetupStatus, type SetupField } from '../api';

interface SetupWizardProps {
  status: SetupStatus;
  onComplete: () => void;
}

function generateSecret(length = 48): string {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DEFAULT_REQUIRED_VALUES: Record<string, string> = {
  POSTGRES_USER: 'orient',
  POSTGRES_PASSWORD: 'your-secure-password',
  MINIO_ROOT_USER: 'orientadmin',
  MINIO_ROOT_PASSWORD: 'your-secure-password',
};

const DEFAULT_OPTIONAL_VALUES: Record<string, string> = {
  S3_BUCKET: 'orient-data',
  ORIENT_APP_DOMAIN: 'app.example.com',
  ORIENT_CODE_DOMAIN: 'code.example.com',
};

function FieldRow({
  field,
  value,
  onChange,
  isMissing,
}: {
  field: SetupField;
  value: string;
  onChange: (value: string) => void;
  isMissing: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{field.label}</p>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
        {!isMissing && (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
            Configured
          </span>
        )}
      </div>
      {isMissing && (
        <div className="flex gap-2">
          <input
            type={field.type || 'text'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            className="input flex-1"
          />
          {field.key === 'DASHBOARD_JWT_SECRET' && (
            <button
              type="button"
              onClick={() => onChange(generateSecret())}
              className="btn btn-secondary px-3"
            >
              Generate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SetupWizard({ status, onComplete }: SetupWizardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  const missingRequired = useMemo(() => new Set(status.missingRequired), [status.missingRequired]);
  const missingOptional = useMemo(() => new Set(status.missingOptional), [status.missingOptional]);
  const requiredDefaults = useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const field of status.requiredFields) {
      if (field.key === 'DASHBOARD_JWT_SECRET') {
        continue;
      }
      const fallback = field.defaultValue || field.placeholder || '';
      if (fallback) {
        defaults[field.key] = fallback;
      }
    }
    return defaults;
  }, [status.requiredFields]);
  const optionalDefaults = useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const field of status.optionalFields) {
      const fallback = field.defaultValue || field.placeholder || '';
      if (fallback) {
        defaults[field.key] = fallback;
      }
    }
    return defaults;
  }, [status.optionalFields]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const validateRequired = (useDefaults: boolean): string[] => {
    return status.requiredFields
      .filter((field) => {
        if (!missingRequired.has(field.key)) return false;
        const fallback =
          values[field.key] ||
          (useDefaults && field.key === 'DASHBOARD_JWT_SECRET' ? 'generated' : '') ||
          (useDefaults ? requiredDefaults[field.key] : '') ||
          '';
        return !fallback.trim();
      })
      .map((field) => field.label);
  };

  const handleSubmit = async (event: React.FormEvent, useDefaults = false) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const missingLabels = useDefaults ? [] : validateRequired(false);
    if (missingLabels.length > 0) {
      setError(`Please provide: ${missingLabels.join(', ')}`);
      return;
    }

    const payload: Record<string, string> = useDefaults
      ? {
          ...DEFAULT_REQUIRED_VALUES,
          ...DEFAULT_OPTIONAL_VALUES,
          ...requiredDefaults,
          ...optionalDefaults,
          ...values,
        }
      : values;

    if (useDefaults) {
      const existingJwt = (payload.DASHBOARD_JWT_SECRET || '').trim();
      if (!existingJwt || existingJwt.length < 32 || existingJwt === '32+ character secret') {
        payload.DASHBOARD_JWT_SECRET = generateSecret();
      }
    }

    setIsSubmitting(true);
    try {
      const result = await applySetup(payload);
      setNeedsRestart(result.needsRestart || result.setupOnly);
      setSuccess('Workspace settings saved successfully.');
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setup values.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="card w-full max-w-2xl p-8 space-y-6 border-border shadow-lg">
        <div className="flex items-start gap-4">
          {/* Ori Mascot - Setup Helper */}
          <div className="w-16 h-16 flex-shrink-0">
            <img
              src={assetUrl('/mascot/variations/setup-helper.png')}
              alt="Ori is here to help"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Let's set up your workspace!</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Hi! I'm Ori. I'll help you configure your Orient workspace. Just fill in the required
              values below.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            {status.requiredFields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={values[field.key] || ''}
                onChange={(val) => handleChange(field.key, val)}
                isMissing={missingRequired.has(field.key)}
              />
            ))}
          </div>

          {status.optionalFields.length > 0 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowOptional((prev) => !prev)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {showOptional ? 'Hide optional settings' : 'Show optional settings'}
              </button>

              {showOptional && (
                <div className="space-y-4">
                  {status.optionalFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={values[field.key] || ''}
                      onChange={(val) => handleChange(field.key, val)}
                      isMissing={missingOptional.has(field.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save workspace settings'}
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full"
              disabled={isSubmitting}
              onClick={(event) => handleSubmit(event, true)}
            >
              Use defaults and continue
            </button>
          </div>
        </form>

        {needsRestart && (
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-sm text-muted-foreground space-y-2">
            <p>
              Restart the workspace container or process to apply these values, then reload the
              page.
            </p>
            <button type="button" className="btn btn-secondary w-full" onClick={onComplete}>
              Reload after restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
