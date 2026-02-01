import React from 'react';
import ScrollReveal from '../shared/ScrollReveal';
import styles from './MeetOriSection.module.css';

export default function MeetOriSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionContent}>
        <div className={styles.meetOriLayout}>
          <div className={styles.meetOriVisual}>
            <img
              src="/img/mascot/ori-thinking.png"
              alt="Ori thinking"
              className={styles.meetOriImage}
              loading="lazy"
            />
          </div>
          <ScrollReveal>
            <div className={styles.meetOriText}>
              <h2 className={styles.sectionTitle}>Meet Ori</h2>
              <p className={styles.subtitle}>Not a chatbot. An agent that acts.</p>
              <p className={styles.body}>
                Ori remembers your preferences, your team, your workflows. Ask about your calendar
                and get a summary. Mention you're running late and it reschedules for you. Need
                something done? Just ask — Ori handles Jira tickets, emails, calendar invites, and
                more.
              </p>
              <p className={styles.body}>
                Get morning briefings, sprint summaries, and reminders without asking. Same Ori
                everywhere — your context follows you across WhatsApp, Slack, and your IDE.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
