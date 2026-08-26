import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Hermeum",
  tagline: "Documentation for the Hermeum project",
  favicon: "img/favicon.ico",

  url: "https://docs.hermeum.app",
  baseUrl: "/",
  trailingSlash: true,

  // v4 enables useCssCascadeLayers, which should make unlayered custom.css
  // override Infima's defaults. However, with @docusaurus/faster (Rspack), the
  // PostCSS pipeline that wraps Infima in @layer is not applied, so layers are
  // absent from the output and the override doesn't work.
  // Workaround: custom.css uses :root:not(#\#):not(#\#) to match Infima's
  // specificity. See https://github.com/facebook/docusaurus/issues/10504
  future: {
    v4: true,
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Hermeum",
      logo: {
        alt: "Hermeum logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "doc",
          docId: "intro",
          label: "Docs",
          position: "left",
        },
      ],
    },
    footer: {
      copyright: `Built by Hermeum · ${new Date().getFullYear()}`,
    },
  },
};

export default config;