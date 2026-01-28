import React from 'react';
import { useScrollReveal } from '../../hooks/useScrollReveal';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  as?: keyof JSX.IntrinsicElements;
}

export default function ScrollReveal({
  children,
  className,
  style,
  delay = 0,
  as: Tag = 'div',
}: ScrollRevealProps) {
  const [ref, isVisible] = useScrollReveal<HTMLElement>();

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={className}
      style={{
        ...style,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
      }}
    >
      {children}
    </Tag>
  );
}
