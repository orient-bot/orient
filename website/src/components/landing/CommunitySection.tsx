import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import ScrollReveal from '../shared/ScrollReveal';
import { GitHubIcon } from '../shared/icons';
import styles from './CommunitySection.module.css';

export default function CommunitySection() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>Built in the open</h2>
          <p className={styles.sectionSubtitle}>
            Orient is community-driven. Contribute skills, report bugs, request features, or just
            star us on GitHub.
          </p>
          <div className={styles.badges}>
            <img
              src="https://img.shields.io/github/stars/orient-bot/orient?style=social"
              alt="GitHub stars"
              loading="lazy"
            />
          </div>
          <p className={styles.extensibility}>
            Build custom skills and share them with the community. Orient is designed to be
            extended.
          </p>
        </ScrollReveal>
        <div className={styles.ctaGroup}>
          <Link
            className={clsx('button', styles.secondaryButton)}
            to="https://github.com/orient-bot/orient"
          >
            <GitHubIcon className={styles.githubIcon} /> View on GitHub
          </Link>
          <Link className={clsx('button', styles.outlineButton)} to="/docs/features/skills">
            Contribute a Skill
          </Link>
        </div>
      </div>
    </section>
  );
}
