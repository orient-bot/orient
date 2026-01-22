import React from 'react';
import Layout from '@theme/Layout';
import styles from './privacy.module.css';

export default function Terms(): JSX.Element {
  return (
    <Layout
      title="Terms & Conditions"
      description="Orient is provided under the MIT License with no warranties. Use at your own risk."
    >
      <div className={styles.legalPage}>
        <header className={styles.header}>
          <h1>Terms & Conditions</h1>
          <p className={styles.lastUpdated}>Last Updated: January 22, 2026</p>
        </header>

        <div className={styles.content}>
          <div className={styles.highlightBox}>
            <p>
              <strong>TL;DR:</strong> Orient is distributed under the MIT License. This means you
              can use, modify, and distribute Orient freely, but it also means: Orient is provided
              "as is" with no guarantees. We've built it to be reliable, but software is complex and
              things can go wrong. You use Orient at your own risk.
            </p>
          </div>

          <h2>Introduction</h2>
          <p>
            These terms explain what you're agreeing to when you use Orient, the open-source AI
            agent platform. Orient is developed and maintained by the Orient project team and
            distributed freely under the MIT License.
          </p>
          <p>
            By downloading, installing, running, or otherwise using Orient, you agree to these
            terms. If you don't agree, please don't use Orient.
          </p>

          <h2>MIT License</h2>
          <p>
            Orient is licensed under the{' '}
            <a
              href="https://github.com/orient-bot/orient/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT License
            </a>
            . The full legal text is available in our GitHub repository. Here's what that means in
            plain language:
          </p>
          <ul>
            <li>
              <strong>You can use Orient:</strong> For personal projects, commercial products, or
              anything else
            </li>
            <li>
              <strong>You can modify Orient:</strong> Change it, extend it, customize it however you
              want
            </li>
            <li>
              <strong>You can distribute Orient:</strong> Share it, fork it, include it in your own
              projects
            </li>
            <li>
              <strong>You must include the license:</strong> If you distribute Orient, include a
              copy of the MIT License
            </li>
          </ul>
          <p>
            The MIT License is permissive and business-friendly. You don't need to ask permission or
            notify us when you use Orient, though we always appreciate hearing about interesting use
            cases!
          </p>

          <h2>No Warranty</h2>
          <p>
            Orient is provided <strong>"as is"</strong>, without warranty of any kind, express or
            implied. In plain English, this means:
          </p>
          <ul>
            <li>
              <strong>We don't guarantee Orient will work perfectly:</strong> We've tested it and
              use it ourselves, but bugs happen and edge cases exist
            </li>
            <li>
              <strong>We don't guarantee Orient will meet your needs:</strong> It might not work for
              your specific use case or environment
            </li>
            <li>
              <strong>We don't guarantee uninterrupted operation:</strong> Updates, dependencies, or
              external APIs can cause issues
            </li>
            <li>
              <strong>We don't guarantee security:</strong> While we follow security best practices,
              no software is perfectly secure
            </li>
          </ul>
          <p>
            This doesn't mean Orient is unreliable! It means we're being legally honest that
            software is complex and we can't make absolute guarantees. We work hard to make Orient
            stable and secure, but you should test it in your environment and use appropriate
            safeguards.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            The Orient developers and contributors are not liable for any damages arising from your
            use of Orient. This includes (but isn't limited to):
          </p>
          <ul>
            <li>Data loss or corruption</li>
            <li>Service interruptions or downtime</li>
            <li>Security breaches or unauthorized access</li>
            <li>Errors in AI-generated content or actions</li>
            <li>Integration failures with third-party services</li>
            <li>Financial losses or business damages</li>
            <li>Any other direct or indirect damages</li>
          </ul>
          <p>
            In other words: we're providing Orient as a free, open-source tool, and we can't be held
            responsible if something goes wrong when you use it. This is standard for open-source
            software.
          </p>

          <h2>Use at Your Own Risk</h2>
          <p>
            Orient is powerful software that integrates with external services and can take actions
            on your behalf. When you deploy and use Orient, you're responsible for:
          </p>
          <ul>
            <li>
              <strong>Testing before production:</strong> Try Orient in a safe environment before
              using it with real data or production systems
            </li>
            <li>
              <strong>Securing your deployment:</strong> Use appropriate authentication, access
              controls, and network security
            </li>
            <li>
              <strong>Monitoring AI actions:</strong> Review what Orient does, especially when it
              has access to sensitive data or systems
            </li>
            <li>
              <strong>Backing up your data:</strong> Maintain backups of important data before
              letting Orient modify it
            </li>
            <li>
              <strong>Reviewing integrations:</strong> Understand what permissions you're granting
              to Orient for external services
            </li>
            <li>
              <strong>Compliance with laws:</strong> Ensure your use of Orient complies with
              applicable laws, regulations, and terms of service
            </li>
          </ul>

          <h2>AI-Generated Content</h2>
          <p>
            Orient uses AI models (currently Claude from Anthropic) to generate responses and take
            actions. You should be aware that:
          </p>
          <ul>
            <li>AI-generated content can be incorrect, misleading, or inappropriate</li>
            <li>AI models can make mistakes, especially with complex or ambiguous requests</li>
            <li>You should review and verify important outputs before relying on them</li>
            <li>
              You're responsible for the content and actions generated through your Orient
              deployment
            </li>
          </ul>
          <p>
            Orient includes safety measures and responsible AI practices, but no AI system is
            perfect. Use good judgment and appropriate oversight.
          </p>

          <h2>Third-Party Services</h2>
          <p>
            Orient integrates with external services (Anthropic, Google, Slack, GitHub, etc.). When
            you use these integrations:
          </p>
          <ul>
            <li>
              You must comply with each service's terms of service and acceptable use policies
            </li>
            <li>You're responsible for any costs incurred with those services</li>
            <li>The Orient team is not responsible for issues with third-party services</li>
            <li>Changes to third-party APIs may break Orient functionality until we update it</li>
          </ul>

          <h2>Community and Contributions</h2>
          <p>
            Orient is a community project, and we welcome contributions! If you contribute code,
            documentation, or other materials to Orient:
          </p>
          <ul>
            <li>You agree to license your contributions under the MIT License</li>
            <li>You represent that you have the right to make those contributions</li>
            <li>You understand that contributions may be modified or rejected by maintainers</li>
          </ul>
          <p>
            See our{' '}
            <a
              href="https://github.com/orient-bot/orient/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contributing Guidelines
            </a>{' '}
            for more information about contributing to Orient.
          </p>

          <h2>Changes to These Terms</h2>
          <p>
            We may update these terms from time to time to reflect changes in the project or legal
            requirements. We'll update the "Last Updated" date when we make changes. Since Orient is
            self-hosted, terms changes don't retroactively affect your existing deployment.
          </p>

          <h2>No Legal Advice</h2>
          <p>
            Nothing in these terms or our documentation constitutes legal advice. If you have legal
            questions about using Orient in your specific situation (compliance, licensing,
            liability, etc.), consult with a qualified attorney.
          </p>

          <h2>Questions and Support</h2>
          <p>
            These terms are about legal responsibilities and disclaimers. For technical support or
            questions about using Orient:
          </p>
          <ul>
            <li>
              Read the{' '}
              <a href="https://orient.bot/docs" target="_blank" rel="noopener noreferrer">
                documentation
              </a>
            </li>
            <li>
              Search{' '}
              <a
                href="https://github.com/orient-bot/orient/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                existing GitHub issues
              </a>
            </li>
            <li>
              Ask questions in{' '}
              <a
                href="https://github.com/orient-bot/orient/discussions"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Discussions
              </a>
            </li>
            <li>
              Join our{' '}
              <a href="https://discord.gg/orient" target="_blank" rel="noopener noreferrer">
                Discord community
              </a>
            </li>
          </ul>
          <p>
            Remember: the Orient project team provides the software but doesn't provide legal
            advice, commercial support guarantees, or liability coverage. We're developers sharing a
            tool we built, not a company providing a commercial service.
          </p>

          <h2>Acknowledgment</h2>
          <p>
            By using Orient, you acknowledge that you've read and understood these terms, and you
            agree to use Orient responsibly and at your own risk. Thanks for being part of the
            Orient community!
          </p>
        </div>
      </div>
    </Layout>
  );
}
