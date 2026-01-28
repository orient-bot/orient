import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/whatsapp',
        'getting-started/slack',
        'getting-started/google',
        'getting-started/webhooks',
        'getting-started/secrets',
      ],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Core Features',
      items: [
        'features/chatting',
        'features/scheduling',
        'features/mini-apps',
        'features/voice',
        'features/agents',
        'features/skills',
        'features/integrations',
      ],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Architecture & Security',
      items: ['features/architecture', 'features/security'],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['help/cli', 'help/feature-flags', 'help/faq', 'help/tips', 'help/troubleshooting'],
      collapsed: false,
    },
  ],
};

export default sidebars;
