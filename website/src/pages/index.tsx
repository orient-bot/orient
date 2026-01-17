import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import styles from './index.module.css';

// Platform icons as inline SVGs for reliability
const WhatsAppIcon = () => (
  <svg className={styles.platformIcon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SlackIcon = () => (
  <svg className={styles.platformIcon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

const TerminalIcon = () => (
  <svg
    className={styles.platformIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

const CodeIcon = () => (
  <svg
    className={styles.platformIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const ShieldIcon = () => (
  <svg
    className={styles.featureIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

const MessageIcon = () => (
  <svg
    className={styles.featureIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const BoxIcon = () => (
  <svg
    className={styles.featureIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);

const CalendarIcon = () => (
  <svg
    className={styles.featureIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const PuzzleIcon = () => (
  <svg
    className={styles.featureIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.452-.802-.933v-.593c0-.535-.434-.969-.969-.969h-3c-.535 0-.969.434-.969.969v3c0 .535.434.969.969.969h.593c.481 0 .863.332.933.803a.98.98 0 0 1-.276.836l-1.611 1.611c-.47.47-1.087.706-1.704.706s-1.233-.235-1.704-.706l-1.568-1.568a1.029 1.029 0 0 0-.878-.289c-.356.072-.629.374-.629.739v1.594c0 .867-.703 1.57-1.57 1.57h-.86c-.867 0-1.57-.703-1.57-1.57v-1.594c0-.365-.273-.667-.629-.739a1.029 1.029 0 0 0-.878.289l-1.568 1.568c-.47.47-1.087.706-1.704.706s-1.233-.235-1.704-.706l-1.611-1.611a.98.98 0 0 1-.276-.836c.07-.471.452-.803.933-.803h.593c.535 0 .969-.434.969-.969v-3c0-.535-.434-.969-.969-.969h-3c-.535 0-.969.434-.969.969v.593c0 .481-.332.863-.802.933a.98.98 0 0 1-.837-.276l-1.611-1.611c-.47-.47-.706-1.087-.706-1.704s.235-1.233.706-1.704l1.568-1.568c.23-.23.338-.556.289-.878-.072-.356-.374-.629-.739-.629h-1.594c-.867 0-1.57-.703-1.57-1.57v-.86c0-.867.703-1.57 1.57-1.57h1.594c.365 0 .667-.273.739-.629a1.028 1.028 0 0 0-.289-.878l-1.568-1.568c-.47-.47-.706-1.087-.706-1.704s.235-1.233.706-1.704l1.611-1.611a.98.98 0 0 1 .837-.276c.47.07.802.452.802.933v.593c0 .535.434.969.969.969h3c.535 0 .969-.434.969-.969v-3c0-.535-.434-.969-.969-.969h-.593c-.481 0-.863-.332-.933-.802a.98.98 0 0 1 .276-.837l1.611-1.611c.47-.47 1.087-.706 1.704-.706s1.233.235 1.704.706l1.568 1.568c.23.23.556.338.878.289.356-.072.629-.374.629-.739v-1.594c0-.867.703-1.57 1.57-1.57h.86c.867 0 1.57.703 1.57 1.57v1.594c0 .365.273.667.629.739.322.049.648-.059.878-.289l1.568-1.568c.47-.47 1.087-.706 1.704-.706s1.233.235 1.704.706l1.611 1.611c.232.232.358.542.276.837-.07.47-.452.802-.933.802h-.593c-.535 0-.969.434-.969.969v3c0 .535.434.969.969.969h3c.535 0 .969-.434.969-.969v-.593c0-.481.332-.863.803-.933a.98.98 0 0 1 .836.276l1.611 1.611c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.568 1.568a1.028 1.028 0 0 0-.289.878c.072.356.374.629.739.629h1.594c.867 0 1.57.703 1.57 1.57v.86c0 .867-.703 1.57-1.57 1.57h-1.594c-.365 0-.667.273-.739.629z"></path>
  </svg>
);

const GitHubIcon = () => (
  <svg className={styles.githubIcon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const PlayIcon = () => (
  <svg className={styles.playIcon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

function HeroSection() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            Ask Ori.
            <br />
            It acts.
          </h1>
          <p className={styles.heroSubtitle}>
            Orient is an open-source AI agent that runs on your infrastructure, understands your
            context, and takes action — scheduling meetings, updating tickets, drafting docs — all
            through natural conversation.
          </p>
          <div className={styles.heroCta}>
            <Link className={clsx('button', styles.primaryButton)} to="/docs/intro">
              Get Started
            </Link>
            <Link
              className={clsx('button', styles.secondaryButton)}
              to="https://github.com/orient-bot/orient"
            >
              <GitHubIcon /> View on GitHub
            </Link>
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

function DemoSection() {
  const [isPlaying, setIsPlaying] = React.useState(false);

  return (
    <section className={clsx(styles.section, styles.demoSection)}>
      <div className={styles.sectionContent}>
        <h2 className={styles.sectionTitle}>See Ori in action</h2>
        <p className={styles.sectionSubtitle}>A quick demo: from conversation to completed task</p>
        <div className={styles.demoContainer}>
          <div className={styles.demoVideo}>
            {/* Video placeholder - replace src with actual demo video */}
            <div className={styles.videoWrapper}>
              <video
                className={styles.video}
                poster="/img/screenshots/demo-poster.png"
                controls={isPlaying}
                onClick={() => setIsPlaying(true)}
              >
                <source src="/video/ori-demo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              {!isPlaying && (
                <button
                  className={styles.playButton}
                  onClick={() => setIsPlaying(true)}
                  aria-label="Play demo video"
                >
                  <PlayIcon />
                </button>
              )}
            </div>
          </div>
          <div className={styles.demoSteps}>
            <div className={styles.demoStep}>
              <span className={styles.stepNumber}>1</span>
              <div className={styles.stepContent}>
                <strong>Ask via WhatsApp</strong>
                <span>"Schedule a meeting with Tom tomorrow at 3pm"</span>
              </div>
            </div>
            <div className={styles.demoStep}>
              <span className={styles.stepNumber}>2</span>
              <div className={styles.stepContent}>
                <strong>Ori checks context</strong>
                <span>Looks up calendars, finds Tom's availability</span>
              </div>
            </div>
            <div className={styles.demoStep}>
              <span className={styles.stepNumber}>3</span>
              <div className={styles.stepContent}>
                <strong>Action taken</strong>
                <span>Meeting scheduled, invites sent, you're notified</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MeetOriSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionContent}>
        <div className={styles.meetOriLayout}>
          <div className={styles.meetOriVisual}>
            <img
              src="/img/mascot/ori-thinking.png"
              alt="Ori thinking"
              className={styles.meetOriImage}
            />
          </div>
          <div className={styles.meetOriText}>
            <h2 className={styles.sectionTitle}>Meet Ori</h2>
            <p className={styles.sectionSubtitle}>Not a chatbot. An agent that acts.</p>
            <p className={styles.sectionBody}>
              Most AI assistants wait for commands. Ori understands context and takes initiative.
              Ask about your calendar and get a summary. Mention you're running late and it
              reschedules for you. Need something done? Just ask — Ori handles Jira tickets, emails,
              calendar invites, and more.
            </p>
            <p className={styles.sectionBody}>
              The more you use it, the more it adapts to how you work.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformsSection() {
  const platforms = [
    {
      icon: <WhatsAppIcon />,
      title: 'WhatsApp',
      description: 'Chat naturally from your phone. Just message Ori like you would a colleague.',
    },
    {
      icon: <SlackIcon />,
      title: 'Slack',
      description: "Built into your team's workflow. Use Orient in channels or DMs.",
    },
    {
      icon: <CodeIcon />,
      title: 'IDE / MCP',
      description:
        "Right in your development environment. Access Orient's tools without leaving your editor.",
    },
    {
      icon: <TerminalIcon />,
      title: 'CLI',
      description: 'Terminal-native for power users. Full control from the command line.',
    },
  ];

  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <h2 className={styles.sectionTitle}>Wherever you are</h2>
        <p className={styles.sectionSubtitle}>Orient meets you on your preferred platform.</p>
        <div className={styles.platformGrid}>
          {platforms.map((platform, idx) => (
            <div key={idx} className={styles.platformCard}>
              <div className={styles.platformIconWrapper}>{platform.icon}</div>
              <h3 className={styles.platformTitle}>{platform.title}</h3>
              <p className={styles.platformDescription}>{platform.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const capabilitiesData = [
  {
    icon: <MessageIcon />,
    title: 'Ask Anything',
    description:
      'Have natural conversations about your projects, schedule, or tasks. Ori pulls context from your integrations to give relevant answers.',
    screenshot: '/img/screenshots/dashboard-workspace.png',
    screenshotAlt: 'Orient workspace with chat interface',
  },
  {
    icon: <BoxIcon />,
    title: 'Build Mini-Apps',
    description:
      'Need a quick feedback form? A scheduler? A dashboard? Just ask. Orient creates and hosts lightweight apps on the fly.',
    screenshot: '/img/screenshots/dashboard-mini-apps.png',
    screenshotAlt: 'Mini-Apps dashboard showing AI-generated applications',
  },
  {
    icon: <PuzzleIcon />,
    title: 'Manage Integrations',
    description:
      'Connect Jira, Google Calendar, Docs, and more. Update tickets, create events, draft documents — all through conversation.',
    screenshot: '/img/screenshots/dashboard-integrations.png',
    screenshotAlt: 'Integrations dashboard with MCP servers and OAuth connections',
  },
  {
    icon: <CalendarIcon />,
    title: 'Configure Agents',
    description:
      'Create specialized agents with custom prompts, skills, and tool permissions. Each agent adapts to specific workflows.',
    screenshot: '/img/screenshots/dashboard-agents.png',
    screenshotAlt: 'Agent Registry showing configurable AI agents',
  },
  {
    icon: <PuzzleIcon />,
    title: 'Customize Prompts',
    description:
      'Fine-tune how Ori responds on each platform. Set default behaviors for WhatsApp, Slack, and other channels.',
    screenshot: '/img/screenshots/dashboard-prompts.png',
    screenshotAlt: 'System Prompts configuration for WhatsApp and Slack',
  },
];

function CapabilitiesSection() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeCapability = capabilitiesData[activeIndex];

  return (
    <section className={styles.section}>
      <div className={styles.sectionContent}>
        <h2 className={styles.sectionTitle}>Surprisingly capable</h2>
        <p className={styles.sectionSubtitle}>More than a simple Q&A bot.</p>

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
                <div className={styles.capabilityNavIcon}>{cap.icon}</div>
                <div className={styles.capabilityNavText}>
                  <h3>{cap.title}</h3>
                  <p>{cap.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className={styles.capabilitiesPreview}>
            <img
              src={activeCapability.screenshot}
              alt={activeCapability.screenshotAlt}
              className={styles.capabilityScreenshot}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PrivacySection() {
  const features = [
    { label: 'Open-source', description: 'MIT licensed, audit the code yourself' },
    { label: 'Self-hosted', description: 'Deploy on your own servers or local machine' },
    { label: 'No telemetry', description: "We don't phone home" },
    { label: 'Full control', description: 'Configure exactly what Orient can access' },
  ];

  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <div className={styles.privacyLayout}>
          <div className={styles.privacyText}>
            <h2 className={styles.sectionTitle}>Yours. Entirely.</h2>
            <p className={styles.sectionBody}>
              Orient runs on your infrastructure. Your conversations, your data, your workflows —
              none of it leaves your control.
            </p>
            <ul className={styles.privacyList}>
              {features.map((feature, idx) => (
                <li key={idx} className={styles.privacyItem}>
                  <ShieldIcon />
                  <div>
                    <strong>{feature.label}</strong>
                    <span>{feature.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.privacyVisual}>
            <div className={styles.shieldGraphic}>
              <ShieldIcon />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GettingStartedSection() {
  const code = `# Clone the repo
git clone https://github.com/orient-bot/orient.git

# Start the demo
docker compose -f docker/docker-compose.demo.yml up -d

# Open the dashboard
open http://localhost:4098`;

  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <h2 className={styles.sectionTitle}>Up and running in minutes</h2>
        <p className={styles.sectionSubtitle}>Scan the QR code, and you're chatting with Ori.</p>
        <div className={styles.codeWrapper}>
          <CodeBlock language="bash">{code}</CodeBlock>
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

function CommunitySection() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={styles.sectionContent}>
        <h2 className={styles.sectionTitle}>Built in the open</h2>
        <p className={styles.sectionSubtitle}>
          Orient is community-driven. Contribute skills, report bugs, request features, or just star
          us on GitHub.
        </p>
        <div className={styles.centeredCta}>
          <Link
            className={clsx('button', styles.secondaryButton)}
            to="https://github.com/orient-bot/orient"
          >
            <GitHubIcon /> View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className={styles.finalCta}>
      <div className={styles.sectionContent}>
        <div className={styles.finalCtaLayout}>
          <img
            src="/img/mascot/ori-waving.png"
            alt="Ori waving"
            className={styles.finalCtaMascot}
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

export default function Home(): React.JSX.Element {
  const { siteConfig: _siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Ask Ori. It acts."
      description="Open-source AI agent that runs on your infrastructure. Connect WhatsApp, Slack, and your dev tools to an agentic companion that takes action for you."
    >
      <main className={styles.main}>
        <HeroSection />
        <DemoSection />
        <MeetOriSection />
        <PlatformsSection />
        <CapabilitiesSection />
        <PrivacySection />
        <GettingStartedSection />
        <CommunitySection />
        <FinalCtaSection />
      </main>
    </Layout>
  );
}
