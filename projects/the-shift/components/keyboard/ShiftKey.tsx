'use client';

import { useState, useCallback } from 'react';

interface ShiftKeyProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showArrow?: boolean;
  className?: string;
  onClick?: () => void;
  animated?: boolean;
  pulsing?: boolean;
}

export default function ShiftKey({
  size = 'lg',
  showArrow = true,
  className = '',
  onClick,
  animated = true,
  pulsing = false,
}: ShiftKeyProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = useCallback(() => {
    if (!animated) {
      onClick?.();
      return;
    }

    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 300);
    onClick?.();
  }, [animated, onClick]);

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-10 py-5 text-xl',
    xl: 'px-16 py-8 text-3xl',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8',
  };

  return (
    <button
      onClick={handleClick}
      className={`
        key-shift key-interactive key-ripple
        inline-flex items-center gap-3
        ${sizeClasses[size]}
        ${isPressed ? 'key-shift-animate ripple-active' : ''}
        ${pulsing && !isPressed ? 'animate-pulse-subtle' : ''}
        ${className}
      `}
    >
      {showArrow && (
        <svg
          className={iconSizes[size]}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      )}
      <span>Shift</span>
    </button>
  );
}
