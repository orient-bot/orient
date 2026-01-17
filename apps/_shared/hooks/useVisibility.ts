import React from 'react';

export type VisibilityRule =
  | { path: string }
  | { not: VisibilityRule }
  | { and: VisibilityRule[] }
  | { or: VisibilityRule[] }
  | { equals: { path: string; value: unknown } };

const getValueAtPath = (data: Record<string, unknown>, path: string): unknown => {
  const parts = path.split('/').filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
};

const evaluateRule = (rule: VisibilityRule, data: Record<string, unknown>): boolean => {
  if ('path' in rule) {
    return Boolean(getValueAtPath(data, rule.path));
  }
  if ('not' in rule) {
    return !evaluateRule(rule.not, data);
  }
  if ('and' in rule) {
    return rule.and.every((child) => evaluateRule(child, data));
  }
  if ('or' in rule) {
    return rule.or.some((child) => evaluateRule(child, data));
  }
  if ('equals' in rule) {
    return getValueAtPath(data, rule.equals.path) === rule.equals.value;
  }
  return false;
};

export const useVisibility = (
  rule: VisibilityRule | undefined,
  data: Record<string, unknown> = {}
): boolean => {
  return React.useMemo(() => {
    if (!rule) {
      return true;
    }
    return evaluateRule(rule, data);
  }, [rule, data]);
};
