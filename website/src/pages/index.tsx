import React, { lazy, Suspense } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HeroSection from '../components/landing/HeroSection';
import styles from './index.module.css';

const DemoSection = lazy(() => import('../components/landing/DemoSection'));
const MeetOriSection = lazy(() => import('../components/landing/MeetOriSection'));
const PlatformsSection = lazy(() => import('../components/landing/PlatformsSection'));
const CapabilitiesSection = lazy(() => import('../components/landing/CapabilitiesSection'));
const UseCasesSection = lazy(() => import('../components/landing/UseCasesSection'));
const PrivacySection = lazy(() => import('../components/landing/PrivacySection'));
const GettingStartedSection = lazy(() => import('../components/landing/GettingStartedSection'));
const CommunitySection = lazy(() => import('../components/landing/CommunitySection'));
const FinalCtaSection = lazy(() => import('../components/landing/FinalCtaSection'));

export default function Home(): React.JSX.Element {
  const { siteConfig: _siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Ask Ori. It acts."
      description="Open-source AI agent that runs on your infrastructure. Connect WhatsApp, Slack, and your dev tools to an agentic companion that takes action for you."
    >
      <main className={styles.main}>
        <HeroSection />
        <Suspense fallback={null}>
          <DemoSection />
          <MeetOriSection />
          <PlatformsSection />
          <CapabilitiesSection />
          <UseCasesSection />
          <PrivacySection />
          <GettingStartedSection />
          <CommunitySection />
          <FinalCtaSection />
        </Suspense>
      </main>
    </Layout>
  );
}
