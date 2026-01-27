import React, { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import styles from './TypingEffect.module.css';

interface TypingEffectProps {
  lines: string[];
  typingSpeed?: number;
  lineDelay?: number;
}

export default function TypingEffect({
  lines,
  typingSpeed = 30,
  lineDelay = 400,
}: TypingEffectProps) {
  const prefersReducedMotion = useReducedMotion();
  const [ref, isVisible] = useScrollReveal<HTMLDivElement>();
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [currentCharIdx, setCurrentCharIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isVisible && !started) {
      setStarted(true);
    }
  }, [isVisible, started]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedLines(lines.map((l) => `$ ${l}`));
      setCurrentLineIdx(lines.length);
      return;
    }

    if (!started || currentLineIdx >= lines.length) return;

    const line = lines[currentLineIdx];
    if (currentCharIdx === 0) {
      setDisplayedLines((prev) => [...prev, '$ ']);
    }

    if (currentCharIdx < line.length) {
      timerRef.current = setTimeout(() => {
        setDisplayedLines((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = `$ ${line.slice(0, currentCharIdx + 1)}`;
          return updated;
        });
        setCurrentCharIdx((c) => c + 1);
      }, typingSpeed);
    } else {
      timerRef.current = setTimeout(() => {
        setCurrentLineIdx((l) => l + 1);
        setCurrentCharIdx(0);
      }, lineDelay);
    }

    return () => clearTimeout(timerRef.current);
  }, [
    started,
    currentLineIdx,
    currentCharIdx,
    lines,
    typingSpeed,
    lineDelay,
    prefersReducedMotion,
  ]);

  const isTyping = started && currentLineIdx < lines.length;

  return (
    <div ref={ref} className={styles.terminal}>
      <div className={styles.terminalHeader}>
        <span className={styles.dot} style={{ background: '#ff5f57' }} />
        <span className={styles.dot} style={{ background: '#febc2e' }} />
        <span className={styles.dot} style={{ background: '#28c840' }} />
      </div>
      <div className={styles.terminalBody}>
        {displayedLines.map((line, i) => (
          <div key={i} className={styles.line}>
            {line}
          </div>
        ))}
        {isTyping && <span className={styles.cursor}>|</span>}
      </div>
    </div>
  );
}
