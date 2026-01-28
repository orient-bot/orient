import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import styles from './FinalCtaSection.module.css';

export default function FinalCtaSection() {
  return (
    <section className={styles.finalCta}>
      <div className={styles.sectionContent}>
        <div className={styles.finalCtaLayout}>
          <img
            src="/img/mascot/ori-waving.png"
            alt="Ori waving"
            className={styles.finalCtaMascot}
            loading="lazy"
          />
          <div className={styles.finalCtaContent}>
            <h2 className={styles.finalCtaTitle}>Ready to meet Ori?</h2>
            <div className={styles.finalCtaButtons}>
              <Link className={clsx('button', styles.primaryButton)} to="/docs/intro">
                Get Started
              </Link>
              <Link className={clsx('button', styles.secondaryButton)} to="/docs/intro">
                Read the Docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
