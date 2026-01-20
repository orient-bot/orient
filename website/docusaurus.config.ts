import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// GitHub repository: https://github.com/orient-bot/orient
const config: Config = {
  title: 'Orient',
  tagline: 'Ask Ori. It acts.',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  // Production URL
  url: 'https://orient.bot',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  // Open Graph / Social metadata
  headTags: [
    {
      tagName: 'meta',
      attributes: {
        property: 'og:title',
        content: 'Orient - Ask Ori. It acts.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:description',
        content:
          'Open-source AI agent that runs on your infrastructure. Takes action through natural conversation.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image',
        content: 'https://orient.bot/img/social-card.png',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:width',
        content: '1200',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:height',
        content: '630',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:type',
        content: 'website',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:title',
        content: 'Orient - Ask Ori. It acts.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:description',
        content:
          'Open-source AI agent that runs on your infrastructure. Takes action through natural conversation.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:image',
        content: 'https://orient.bot/img/social-card.png',
      },
    },
  ],

  markdown: {
    preprocessor: ({ filePath, fileContent }) => fileContent,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/docs', // Docs at /docs, landing page at root
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Orient',
      logo: {
        alt: 'Ori - Orient mascot',
        src: 'img/ori.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/orient-bot/orient',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/whatsapp',
            },
            {
              label: 'Features',
              to: '/docs/features/chatting',
            },
          ],
        },
        {
          title: 'Platforms',
          items: [
            {
              label: 'WhatsApp',
              to: '/docs/getting-started/whatsapp',
            },
            {
              label: 'Slack',
              to: '/docs/getting-started/slack',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/orient-bot/orient',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Orient. Open-source under MIT license.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
