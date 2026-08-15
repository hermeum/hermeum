import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Hermeum",
  tagline: "Documentation for the Hermeum project",
  favicon: "img/favicon.ico",

  url: "https://hermeum.app",
  baseUrl: "/docs/",
  trailingSlash: true,

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
          to: "/",
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