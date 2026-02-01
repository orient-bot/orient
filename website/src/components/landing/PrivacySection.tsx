import React from 'react';
import clsx from 'clsx';
import ScrollReveal from '../shared/ScrollReveal';
import { ShieldIcon } from '../shared/icons';
import styles from './PrivacySection.module.css';

const features = [
  { label: 'Open-source', description: 'MIT licensed, audit every line yourself' },
  { label: 'Runs on YOUR machine', description: 'Deploy on your own servers or local machine' },
  { label: 'Zero telemetry, zero tracking', description: "We don't phone home. Ever." },
  { label: 'Full control', description: 'Configure exactly what Orient can access' },
  {
    label: 'End-to-end encrypted',
    description: 'Your messages never touch our servers',
  },
  {
    label: 'Audit everything',
    description: 'Every line of code is open. Every action is logged.',
  },
];

export default function PrivacySection() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <div className={styles.privacyLayout}>
          <ScrollReveal>
            <div className={styles.privacyText}>
              <h2 className={styles.sectionTitle}>Yours. Entirely.</h2>
              <p className={styles.body}>
                Orient runs on your infrastructure. Your conversations, your data, your workflows —
                none of it leaves your control.
              </p>
              <ul className={styles.privacyList}>
                {features.map((feature, idx) => (
                  <li key={idx} className={styles.privacyItem}>
                    <ShieldIcon className={styles.shieldItemIcon} />
                    <div>
                      <strong>{feature.label}</strong>
                      <span>{feature.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
          <div className={styles.privacyVisual}>
            <div className={styles.shieldGraphic}>
              <ShieldIcon className={styles.shieldMainIcon} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
