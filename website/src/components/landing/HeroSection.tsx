import React, { useState } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import { GitHubIcon } from '../shared/icons';
import styles from './HeroSection.module.css';

const INSTALL_COMMAND = 'curl -fsSL https://orient.bot/install.sh | bash';

export default function HeroSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <span className={styles.word1}>Ask</span> <span className={styles.word2}>Ori.</span>
            <br />
            <span className={styles.word3}>It</span> <span className={styles.word4}>acts.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Your private AI assistant that actually does things — schedule meetings, manage tickets,
            build mini-apps, draft documents — all through natural conversation. Self-hosted,
            open-source, fully yours.
          </p>
          <div className={styles.heroCta}>
            <Link className={clsx('button', styles.primaryButton)} to="/docs/intro">
              Get Started
            </Link>
            <Link
              className={clsx('button', styles.secondaryButton)}
              to="https://github.com/orient-bot/orient"
            >
              <GitHubIcon className={styles.githubIcon} /> View on GitHub
            </Link>
          </div>
          <div className={styles.installBadge}>
            <code>{INSTALL_COMMAND}</code>
            <button
              className={styles.copyButton}
              onClick={handleCopy}
              title="Copy to clipboard"
              aria-label="Copy install command to clipboard"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <img
            src="/img/mascot/ori-attentive.png"
            alt="Ori - the Orient mascot"
            className={styles.mascot}
          />
        </div>
      </div>
    </header>
  );
}
