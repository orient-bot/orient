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
      label: 'Features',
      items: ['features/chatting', 'features/scheduling', 'features/mini-apps'],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Help',
      items: ['help/tips', 'help/faq', 'help/troubleshooting', 'help/cli'],
      collapsed: false,
    },
  ],
};

export default sidebars;
