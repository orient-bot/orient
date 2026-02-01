import React from 'react';
import clsx from 'clsx';
import ScrollReveal from '../shared/ScrollReveal';
import { WhatsAppIcon, SlackIcon, CodeIcon, TerminalIcon, MicrophoneIcon } from '../shared/icons';
import styles from './PlatformsSection.module.css';

const platforms = [
  {
    icon: WhatsAppIcon,
    title: 'WhatsApp',
    description: 'Chat naturally from your phone. Just message Ori like you would a colleague.',
  },
  {
    icon: SlackIcon,
    title: 'Slack',
    description: "Built into your team's workflow. Use Orient in channels or DMs.",
  },
  {
    icon: CodeIcon,
    title: 'IDE / MCP',
    description:
      "Right in your development environment. Access Orient's tools without leaving your editor.",
  },
  {
    icon: TerminalIcon,
    title: 'CLI',
    description: 'Terminal-native for power users. Full control from the command line.',
  },
  {
    icon: MicrophoneIcon,
    title: 'Voice',
    description: 'Talk to Ori hands-free. Voice commands and wake-word activation.',
  },
];

export default function PlatformsSection() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>Wherever you are</h2>
          <p className={styles.sectionSubtitle}>Orient meets you on your preferred platform.</p>
        </ScrollReveal>
        <div className={styles.platformGrid}>
          {platforms.map((platform, idx) => (
            <ScrollReveal key={platform.title} delay={idx * 0.1}>
              <div className={styles.platformCard}>
                <div className={styles.platformIconWrapper}>
                  <platform.icon className={styles.platformIcon} />
                </div>
                <h3 className={styles.platformTitle}>{platform.title}</h3>
                <p className={styles.platformDescription}>{platform.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
        <ScrollReveal delay={0.3}>
          <p className={styles.crossPlatformTagline}>
            Same memory, same context, every platform. Start a conversation on WhatsApp, continue in
            Slack.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
