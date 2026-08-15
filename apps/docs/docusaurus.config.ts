import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Hermeum",
  tagline: "Documentation for the Hermeum project",
  favicon: "img/favicon.ico",

  url: "https://hermeum.app",
  baseUrl: "/",

  future: {
    v4: true,
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
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
          to: "/docs/intro",
          label: "Docs",
          position: "left",
        },
      ],
    },
    footer: {
      copyright: `Copyright © ${new Date().getFullYear()} Hermeum. Built with Docusaurus.`,
    },
  },
};

export default config;