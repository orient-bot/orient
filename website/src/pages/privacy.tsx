import React from 'react';
import Layout from '@theme/Layout';
import styles from './privacy.module.css';

export default function Privacy(): JSX.Element {
  return (
    <Layout
      title="Privacy Policy"
      description="Orient is self-hosted open-source software. We don't collect any data from your deployment."
    >
      <div className={styles.legalPage}>
        <header className={styles.header}>
          <h1>Privacy Policy</h1>
          <p className={styles.lastUpdated}>Last Updated: January 22, 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.highlightBox}>
            <p>
              <strong>TL;DR:</strong> Orient is an open-source AI agent that you deploy and run on
              your own infrastructure. We (the Orient project developers) don't collect any data
              from your Orient deployment because we never receive it. Orient runs entirely on your
              infrastructure.
            </p>
          </div>

          <h2>What is Orient?</h2>
          <p>
            Orient is an open-source software project distributed under the MIT License. It's a
            conversational AI agent that you deploy on your own servers, computers, or cloud
            infrastructure. The Orient team develops and maintains the codebase, but we don't
            operate any central services that collect or process your data.
          </p>

          <h2>No Data Collection by Orient Developers</h2>
          <p>
            The Orient project team does not collect, store, or process any data from your Orient
            deployment. This includes:
          </p>
          <ul>
            <li>Your conversations with Orient</li>
            <li>Your integration credentials (API keys, OAuth tokens, etc.)</li>
            <li>Files or documents processed by Orient</li>
            <li>Usage statistics or telemetry</li>
            <li>Logs or error reports</li>
            <li>Any personally identifiable information (PII)</li>
          </ul>
          <p>
            There is no "Orient cloud service" or central backend that your deployment connects to.
            When you run Orient, all data stays within your infrastructure.
          </p>

          <h2>Self-Hosted Architecture</h2>
          <p>Orient is designed to be completely self-hosted. When you deploy Orient:</p>
          <ul>
            <li>All conversation data is stored in your database (PostgreSQL)</li>
            <li>All files and attachments are stored on your file system or object storage</li>
            <li>All processing happens on your infrastructure</li>
            <li>
              Network requests only go to services <em>you</em> configure (like Anthropic's API,
              Google Workspace, Slack, etc.)
            </li>
          </ul>
          <p>
            The Orient codebase is open source and available for inspection on{' '}
            <a href="https://github.com/orient/orient" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            . You can verify that there are no hidden data collection mechanisms.
          </p>

          <h2>Your Responsibility as a Deployer</h2>
          <p>
            If you're running Orient for yourself or your organization, <strong>you</strong> are
            responsible for:
          </p>
          <ul>
            <li>Securing your Orient deployment and infrastructure</li>
            <li>Managing access controls and authentication</li>
            <li>Complying with applicable privacy laws (GDPR, CCPA, etc.) for your use case</li>
            <li>Informing your users about how their data is handled in your deployment</li>
            <li>Backing up and protecting data stored by Orient</li>
            <li>Monitoring and logging practices on your infrastructure</li>
          </ul>
          <p>
            Orient provides tools for authentication, access control, and secure integrations, but
            ultimately you control how it's deployed and who has access.
          </p>

          <h2>Third-Party Services</h2>
          <p>Orient integrates with external services that you choose to configure, such as:</p>
          <ul>
            <li>
              <strong>Anthropic API:</strong> For Claude AI model access (required for Orient to
              function)
            </li>
            <li>
              <strong>Google Workspace:</strong> For Gmail, Calendar, Drive, Docs integration
              (optional)
            </li>
            <li>
              <strong>Slack:</strong> For Slack messaging integration (optional)
            </li>
            <li>
              <strong>GitHub:</strong> For repository interactions (optional)
            </li>
            <li>
              <strong>Other integrations:</strong> WhatsApp, Linear, Notion, etc. (all optional)
            </li>
          </ul>
          <p>
            When you configure these integrations, Orient will send data to these services according
            to their APIs. Each third-party service has its own privacy policy that governs how they
            handle data:
          </p>
          <ul>
            <li>
              <a
                href="https://www.anthropic.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthropic Privacy Policy
              </a>
            </li>
            <li>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Privacy Policy
              </a>
            </li>
            <li>
              <a
                href="https://slack.com/trust/privacy/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Slack Privacy Policy
              </a>
            </li>
          </ul>
          <p>You should review the privacy policies of any services you integrate with Orient.</p>

          <h2>Website Analytics</h2>
          <p>
            This documentation website (orient.bot) may use basic analytics to understand visitor
            traffic. This is separate from the Orient software itself and only applies to this
            website. No analytics are built into the Orient application code.
          </p>

          <h2>Changes to This Privacy Policy</h2>
          <p>
            We may update this privacy policy from time to time to reflect changes in the project or
            clarify our practices. Updates will be posted on this page with a new "Last Updated"
            date. Since Orient is self-hosted, policy changes don't affect your existing deployment
            unless you choose to update your Orient version.
          </p>

          <h2>Contact</h2>
          <p>If you have questions about this privacy policy or Orient's architecture, please:</p>
          <ul>
            <li>
              Open an issue on{' '}
              <a
                href="https://github.com/orient/orient/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </li>
            <li>
              Join the discussion in our{' '}
              <a
                href="https://github.com/orient/orient/discussions"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Discussions
              </a>
            </li>
          </ul>
          <p>
            For privacy concerns specific to your deployment, contact your Orient administrator (not
            the Orient project team).
          </p>
        </div>
      </div>
    </Layout>
  );
}
