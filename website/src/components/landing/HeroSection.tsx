import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import { GitHubIcon } from '../shared/icons';
import styles from './HeroSection.module.css';

export default function HeroSection() {
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
            <code>docker compose up -d</code>
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
