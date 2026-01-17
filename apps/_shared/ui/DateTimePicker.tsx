/**
 * DateTimePicker Component
 *
 * Simple date and time picker following design system
 */

import React from 'react';

export interface DateTimePickerProps {
  label?: string;
  value?: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  error?: string;
  helperText?: string;
  className?: string;
  required?: boolean;
}

export function DateTimePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  error,
  helperText,
  className = '',
  required,
}: DateTimePickerProps) {
  const formatDateTimeLocal = (date: Date | null | undefined): string => {
    if (!date) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      onChange(new Date(val));
    } else {
      onChange(null);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-sm font-medium leading-none">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type="datetime-local"
        value={formatDateTimeLocal(value)}
        onChange={handleChange}
        min={minDate ? formatDateTimeLocal(minDate) : undefined}
        max={maxDate ? formatDateTimeLocal(maxDate) : undefined}
        required={required}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? 'border-red-500 focus-visible:ring-red-500' : ''
        }`}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

export default DateTimePicker;
