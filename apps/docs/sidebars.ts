import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "doc",
      id: "intro",
      label: "What is Hermeum",
    },
    {
      type: "category",
      label: "Using Hermeum",
      items: [
        "using-hermeum/getting-started",
        "using-hermeum/creating-an-agent",
        "using-hermeum/messaging-platforms",
        "using-hermeum/shared-env-sets",
        "using-hermeum/accessing-your-agent",
      ],
    },
    {
      type: "category",
      label: "Self-hosting",
      items: [
        "operation/overview",
        "operation/installation",
        "operation/configuration-reference",
        "operation/instance-config",
        "operation/database",
        "operation/auth",
        "operation/mutating-webhook",
        "operation/ingress-tls",
      ],
    },
  ],
};

export default sidebars;