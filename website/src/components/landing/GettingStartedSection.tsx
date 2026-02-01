import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import ScrollReveal from '../shared/ScrollReveal';
import TypingEffect from '../shared/TypingEffect';
import styles from './GettingStartedSection.module.css';

const terminalLines = ['curl -fsSL https://orient.bot/install.sh | bash', 'orient start'];

const resultBadges = [
  'Dashboard ready at localhost:4098',
  'Scan QR code to connect WhatsApp',
  'Start chatting with Ori',
];

export default function GettingStartedSection() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>Up and running in minutes</h2>
          <p className={styles.sectionSubtitle}>Scan the QR code, and you're chatting with Ori.</p>
        </ScrollReveal>
        <div className={styles.terminalWrapper}>
          <TypingEffect lines={terminalLines} />
        </div>
        <div className={styles.resultBadges}>
          {resultBadges.map((badge, idx) => (
            <ScrollReveal key={badge} delay={0.2 + idx * 0.15}>
              <div className={styles.badge}>
                <span className={styles.badgeCheck}>&#10003;</span>
                {badge}
              </div>
            </ScrollReveal>
          ))}
        </div>
        <div className={styles.centeredCta}>
          <Link className={clsx('button', styles.primaryButton)} to="/docs/intro">
            Read the full setup guide
          </Link>
        </div>
      </div>
    </section>
  );
}
