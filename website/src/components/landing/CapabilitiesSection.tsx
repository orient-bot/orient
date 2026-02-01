import React from 'react';
import clsx from 'clsx';
import ScrollReveal from '../shared/ScrollReveal';
import {
  MessageIcon,
  BoxIcon,
  PuzzleIcon,
  CalendarIcon,
  GlobeIcon,
  LayersIcon,
} from '../shared/icons';
import styles from './CapabilitiesSection.module.css';

const capabilitiesData = [
  {
    icon: MessageIcon,
    title: 'Ask Anything',
    description:
      'Have natural conversations about your projects, schedule, or tasks. Ori pulls context from your integrations to give relevant answers.',
    screenshot: '/img/screenshots/dashboard-workspace.png',
    screenshotAlt: 'Orient workspace with chat interface',
  },
  {
    icon: BoxIcon,
    title: 'Build Mini-Apps',
    description:
      'Need a quick feedback form? A scheduler? A dashboard? Just ask. Orient creates and hosts lightweight apps on the fly.',
    screenshot: '/img/screenshots/dashboard-mini-apps.png',
    screenshotAlt: 'Mini-Apps dashboard showing AI-generated applications',
  },
  {
    icon: PuzzleIcon,
    title: 'Manage Integrations',
    description:
      'Connect Jira, Google Calendar, Docs, and more. Update tickets, create events, draft documents — all through conversation.',
    screenshot: '/img/screenshots/dashboard-integrations.png',
    screenshotAlt: 'Integrations dashboard with MCP servers and OAuth connections',
  },
  {
    icon: CalendarIcon,
    title: 'Configure Agents',
    description:
      'Create specialized agents with custom prompts, skills, and tool permissions. Each agent adapts to specific workflows.',
    screenshot: '/img/screenshots/dashboard-agents.png',
    screenshotAlt: 'Agent Registry showing configurable AI agents',
  },
  {
    icon: PuzzleIcon,
    title: 'Customize Prompts',
    description:
      'Fine-tune how Ori responds on each platform. Set default behaviors for WhatsApp, Slack, and other channels.',
    screenshot: '/img/screenshots/dashboard-prompts.png',
    screenshotAlt: 'System Prompts configuration for WhatsApp and Slack',
  },
  {
    icon: GlobeIcon,
    title: 'Browser Actions',
    description:
      'Orient navigates websites, fills forms, and extracts data with precision. Automate repetitive browser tasks through conversation.',
    screenshot: '/img/screenshots/dashboard-workspace.png',
    screenshotAlt: 'Browser automation in action',
  },
  {
    icon: LayersIcon,
    title: 'Custom Skills',
    description:
      'Extend Orient with community-built skills or create your own. From Spotify control to smart home automation.',
    screenshot: '/img/screenshots/dashboard-agents.png',
    screenshotAlt: 'Skills configuration panel',
  },
];

export default function CapabilitiesSection() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeCapability = capabilitiesData[activeIndex];

  return (
    <section className={styles.section}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>Surprisingly capable</h2>
          <p className={styles.sectionSubtitle}>More than a simple Q&A bot.</p>
        </ScrollReveal>

        <div className={styles.capabilitiesShowcase}>
          <div className={styles.capabilitiesNav}>
            {capabilitiesData.map((cap, idx) => (
              <button
                key={cap.title}
                className={clsx(
                  styles.capabilityNavItem,
                  idx === activeIndex && styles.capabilityNavItemActive
                )}
                onClick={() => setActiveIndex(idx)}
                type="button"
              >
                <div className={styles.capabilityNavIcon}>
                  <cap.icon />
                </div>
                <div className={styles.capabilityNavText}>
                  <h3>{cap.title}</h3>
                  <p>{cap.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className={styles.capabilitiesPreview}>
            <img
              key={activeCapability.screenshot}
              src={activeCapability.screenshot}
              alt={activeCapability.screenshotAlt}
              className={styles.capabilityScreenshot}
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
