export type ValidationRule = {
  name: string;
  message: string;
  validate: (value: string) => boolean;
};

export const required = (message = 'This field is required'): ValidationRule => ({
  name: 'required',
  message,
  validate: (value) => value.trim().length > 0,
});

export const email = (message = 'Enter a valid email'): ValidationRule => ({
  name: 'email',
  message,
  validate: (value) =>
    value.length === 0 ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
});

export const minLength = (min: number, message?: string): ValidationRule => ({
  name: 'minLength',
  message: message || `Must be at least ${min} characters`,
  validate: (value) => value.length === 0 || value.length >= min,
});

export const maxLength = (max: number, message?: string): ValidationRule => ({
  name: 'maxLength',
  message: message || `Must be at most ${max} characters`,
  validate: (value) => value.length === 0 || value.length <= max,
});

export const pattern = (regex: RegExp, message: string): ValidationRule => ({
  name: 'pattern',
  message,
  validate: (value) => value.length === 0 || regex.test(value),
});

export const validateValue = (
  value: unknown,
  rules?: ValidationRule[]
): string | undefined => {
  if (!rules || rules.length === 0) {
    return undefined;
  }

  const normalized = value === undefined || value === null ? '' : String(value);
  for (const rule of rules) {
    if (!rule.validate(normalized)) {
      return rule.message;
    }
  }

  return undefined;
};
