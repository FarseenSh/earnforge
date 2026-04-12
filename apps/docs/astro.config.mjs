import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'EarnForge',
      customCss: ['./src/styles/custom.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/FarseenSh/earnforge',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [{ label: 'Introduction', link: '/' }],
        },
        {
          label: 'Packages',
          items: [
            { label: 'SDK Reference', link: '/sdk/' },
            { label: 'CLI Reference', link: '/cli/' },
            { label: 'React Hooks', link: '/react/' },
            { label: 'MCP Server', link: '/mcp/' },
            { label: 'Agent Skill', link: '/skill/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Risk Scoring', link: '/risk/' },
            { label: '18 Pitfalls', link: '/pitfalls/' },
          ],
        },
      ],
    }),
  ],
});
