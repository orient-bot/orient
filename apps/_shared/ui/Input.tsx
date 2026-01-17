/**
 * Input Component
 *
 * Follows the design system: h-9 rounded-md border border-input
 */

import React from 'react';
import { validateValue, type ValidationRule } from '../utils/validation';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  checks?: ValidationRule[];
  validateOn?: 'blur' | 'change' | 'submit' | 'none';
}

export function Input({
  label,
  error,
  helperText,
  checks,
  validateOn = 'blur',
  className = '',
  id,
  onBlur,
  onChange,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const [validationError, setValidationError] = React.useState<string | undefined>();

  const runValidation = React.useCallback(
    (value: unknown) => {
      if (!checks || validateOn === 'none' || validateOn === 'submit') {
        return;
      }
      setValidationError(validateValue(value, checks));
    },
    [checks, validateOn]
  );

  const activeError = error || validationError;

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(activeError)}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          activeError ? 'border-red-500 focus-visible:ring-red-500' : ''
        } ${className}`}
        onBlur={(event) => {
          if (validateOn === 'blur') {
            runValidation(event.target.value);
          }
          onBlur?.(event);
        }}
        onChange={(event) => {
          if (validateOn === 'change') {
            runValidation(event.target.value);
          }
          onChange?.(event);
        }}
        {...props}
      />
      {activeError && <p className="text-sm text-red-500">{activeError}</p>}
      {helperText && !activeError && (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

export default Input;
