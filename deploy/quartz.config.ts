import { QuartzConfig } from './quartz/cfg';
import * as Plugin from './quartz/plugins';

const config: QuartzConfig = {
  configuration: {
    pageTitle: 'Campaign Notes',
    pageTitleSuffix: '',
    enableSPA: true,
    enablePopovers: true,
    analytics: { provider: 'none' },
    locale: 'en-US',
    // Must match where the site is served: player-portal proxies /notes/* here.
    // Quartz uses this to generate canonical URLs and to prefix internal links
    // in the built output so navigation works under /notes/ rather than /.
    baseUrl: 'addnd.net/notes',
    ignorePatterns: ['.obsidian', 'templates', 'Templates', 'private'],
    defaultDateType: 'modified',
    theme: {
      // Use system fonts to avoid Google Fonts network dependency in the container.
      fontOrigin: 'local',
      cdnCaching: false,
      typography: {
        header: 'Schibsted Grotesk',
        body: 'Source Sans Pro',
        code: 'IBM Plex Mono',
      },
      colors: {
        lightMode: {
          light: '#faf8f8',
          lightgray: '#e5e5e5',
          gray: '#b8b8b8',
          darkgray: '#4e4e4e',
          dark: '#2b2b2b',
          secondary: '#284b63',
          tertiary: '#84a59d',
          highlight: 'rgba(143, 159, 169, 0.15)',
          textHighlight: '#fff23688',
        },
        darkMode: {
          light: '#161618',
          lightgray: '#393639',
          gray: '#646464',
          darkgray: '#d4d4d4',
          dark: '#ebebec',
          secondary: '#7b97aa',
          tertiary: '#84a59d',
          highlight: 'rgba(143, 159, 169, 0.15)',
          textHighlight: '#b3aa0288',
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ['frontmatter', 'git', 'filesystem'],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: 'github-light',
          dark: 'github-dark',
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: 'shortest' }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: 'katex' }),
    ],
    // ExplicitPublish: only notes with `publish: true` in frontmatter appear
    // in the built site.  All other notes (no frontmatter or publish: false)
    // are excluded.  Set `publish: true` on a note to include it.
    filters: [Plugin.ExplicitPublish()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: false,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // CustomOgImages omitted — slow and unnecessary for an internal tool.
    ],
  },
};

export default config;
