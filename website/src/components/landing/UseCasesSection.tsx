import React from 'react';
import ScrollReveal from '../shared/ScrollReveal';
import { SunriseIcon, UsersIcon, ZapIcon, ClockIcon } from '../shared/icons';
import styles from './UseCasesSection.module.css';

const useCases = [
  {
    icon: SunriseIcon,
    title: 'Morning Briefing',
    userMessage: null,
    oriResponse:
      'Good morning! You have 3 meetings today, 2 Jira tickets due, and an email from Sarah about the Q2 roadmap.',
    result: 'Daily digest delivered',
  },
  {
    icon: UsersIcon,
    title: 'Sprint Standup',
    userMessage: 'What did I work on yesterday?',
    oriResponse:
      'You closed PROJ-142 (auth bug), pushed 3 commits to feature/dashboard, and had a 1:1 with Alex about the API redesign.',
    result: 'Cross-integration summary',
  },
  {
    icon: ZapIcon,
    title: 'Quick Mini-App',
    userMessage: 'Create a feedback form for the team offsite',
    oriResponse:
      "Done! I created a feedback form with 5 questions. Here's the link: orient.local/apps/offsite-feedback",
    result: 'Mini-app live',
  },
  {
    icon: ClockIcon,
    title: 'Smart Scheduling',
    userMessage: 'Schedule a 1:1 with Alex this week',
    oriResponse:
      "I checked both calendars. Thursday 2-2:30pm works for both of you. I've sent the invite.",
    result: 'Calendar event created',
  },
];

export default function UseCasesSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>Real workflows, not demos</h2>
          <p className={styles.sectionSubtitle}>See how people use Orient every day.</p>
        </ScrollReveal>
        <div className={styles.useCaseGrid}>
          {useCases.map((uc, idx) => (
            <ScrollReveal key={uc.title} delay={idx * 0.12}>
              <div className={styles.useCaseCard}>
                <div className={styles.cardHeader}>
                  <uc.icon className={styles.cardIcon} />
                  <h3 className={styles.cardTitle}>{uc.title}</h3>
                </div>
                <div className={styles.chatBubbles}>
                  {uc.userMessage && (
                    <div className={styles.userBubble}>
                      <span className={styles.bubbleLabel}>You</span>
                      {uc.userMessage}
                    </div>
                  )}
                  <div className={styles.oriBubble}>
                    <span className={styles.bubbleLabel}>Ori</span>
                    {uc.oriResponse}
                  </div>
                </div>
                <div className={styles.resultBadge}>{uc.result}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
