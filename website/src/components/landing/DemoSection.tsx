import React from 'react';
import clsx from 'clsx';
import ScrollReveal from '../shared/ScrollReveal';
import { PlayIcon } from '../shared/icons';
import styles from './DemoSection.module.css';

export default function DemoSection() {
  const [isPlaying, setIsPlaying] = React.useState(false);

  return (
    <section className={clsx(styles.section, styles.demoSection)}>
      <div className={styles.sectionContent}>
        <ScrollReveal>
          <h2 className={styles.sectionTitle}>See Ori in action</h2>
          <p className={styles.sectionSubtitle}>
            A quick demo: from conversation to completed task
          </p>
        </ScrollReveal>
        <div className={styles.demoContainer}>
          <div className={styles.demoVideo}>
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
                  <PlayIcon className={styles.playIcon} />
                </button>
              )}
            </div>
          </div>
          <div className={styles.demoSteps}>
            {[
              {
                num: 1,
                title: 'Ask via WhatsApp',
                desc: '"Schedule a meeting with Tom tomorrow at 3pm"',
              },
              {
                num: 2,
                title: 'Ori checks context',
                desc: "Looks up calendars, finds Tom's availability",
              },
              {
                num: 3,
                title: 'Action taken',
                desc: "Meeting scheduled, invites sent, you're notified",
              },
            ].map((step, i) => (
              <ScrollReveal key={step.num} delay={i * 0.15}>
                <div className={styles.demoStep}>
                  <span className={styles.stepNumber}>{step.num}</span>
                  <div className={styles.stepContent}>
                    <strong>{step.title}</strong>
                    <span>{step.desc}</span>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
