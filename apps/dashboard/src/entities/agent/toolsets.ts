import type { Agent } from "./schema";

// Toolset availability — a derived, read-only view of which Hermes toolsets
// are usable for an agent, computed from its config + env. Not persisted.
// https://hermes-agent.nousresearch.com/docs/user-guide/features/tools
//
// The catalog mirrors Hermes' CONFIGURABLE_TOOLSETS
// (vendor/hermes-agent/hermes_cli/tools_config.py): the 25 built-in toolsets
// in the same order. Plugin toolsets and platform-native toolsets outside
// CONFIGURABLE_TOOLSETS are not listed here.

export enum ToolsetId {
  Web = "web",
  Browser = "browser",
  Terminal = "terminal",
  File = "file",
  CodeExecution = "codeExecution",
  Vision = "vision",
  Video = "video",
  ImageGen = "imageGen",
  VideoGen = "videoGen",
  XSearch = "xSearch",
  Tts = "tts",
  Skills = "skills",
  Todo = "todo",
  Memory = "memory",
  ContextEngine = "contextEngine",
  SessionSearch = "sessionSearch",
  Clarify = "clarify",
  Delegation = "delegation",
  Cronjob = "cronjob",
  HomeAssistant = "homeAssistant",
  Spotify = "spotify",
  Discord = "discord",
  DiscordAdmin = "discordAdmin",
  Yuanbao = "yuanbao",
  ComputerUse = "computerUse",
}

export type ToolsetStatus = "available" | "unavailable";

export interface ToolsetAvailability {
  status: ToolsetStatus;
  /** Short explanation shown when status is not "available". */
  reason?: string;
}

interface ToolsetMeta {
  label: string;
  description: string;
}

const TOOLSET_META: Record<ToolsetId, ToolsetMeta> = {
  [ToolsetId.Web]: {
    label: "Web",
    description: "Search the web and extract page content.",
  },
  [ToolsetId.Browser]: {
    label: "Browser",
    description: "Interactive browser automation.",
  },
  [ToolsetId.Terminal]: {
    label: "Terminal",
    description: "Execute shell commands.",
  },
  [ToolsetId.File]: {
    label: "File",
    description: "Read, edit, and search files.",
  },
  [ToolsetId.CodeExecution]: {
    label: "Code Execution",
    description: "Run code in an isolated sandbox.",
  },
  [ToolsetId.Vision]: {
    label: "Vision",
    description: "Analyze images with a vision-capable model.",
  },
  [ToolsetId.Video]: {
    label: "Video",
    description: "Analyze video with a video-capable model.",
  },
  [ToolsetId.ImageGen]: {
    label: "Image Generation",
    description: "Generate images from text prompts.",
  },
  [ToolsetId.VideoGen]: {
    label: "Video Generation",
    description: "Generate video from text, image, or reference input.",
  },
  [ToolsetId.XSearch]: {
    label: "X Search",
    description: "Search X (Twitter) posts via xAI.",
  },
  [ToolsetId.Tts]: {
    label: "Text-to-Speech",
    description: "Convert text to spoken audio.",
  },
  [ToolsetId.Skills]: {
    label: "Skills",
    description: "List, view, and manage installed skills.",
  },
  [ToolsetId.Todo]: {
    label: "Todo",
    description: "Track and plan tasks within a conversation.",
  },
  [ToolsetId.Memory]: {
    label: "Memory",
    description: "Persistent memory and recall across sessions.",
  },
  [ToolsetId.ContextEngine]: {
    label: "Context Engine",
    description: "Runtime tools from the active context engine.",
  },
  [ToolsetId.SessionSearch]: {
    label: "Session Search",
    description: "Search past conversation sessions.",
  },
  [ToolsetId.Clarify]: {
    label: "Clarify",
    description: "Ask the user clarifying questions.",
  },
  [ToolsetId.Delegation]: {
    label: "Delegation",
    description: "Delegate tasks to subagents.",
  },
  [ToolsetId.Cronjob]: {
    label: "Cron",
    description: "Schedule and manage recurring jobs.",
  },
  [ToolsetId.HomeAssistant]: {
    label: "Home Assistant",
    description: "Control smart home devices via Home Assistant.",
  },
  [ToolsetId.Spotify]: {
    label: "Spotify",
    description: "Control Spotify playback, playlists, and library.",
  },
  [ToolsetId.Discord]: {
    label: "Discord",
    description: "Read and participate in Discord channels.",
  },
  [ToolsetId.DiscordAdmin]: {
    label: "Discord Admin",
    description: "Administer Discord servers: channels, roles, pins.",
  },
  [ToolsetId.Yuanbao]: {
    label: "Yuanbao",
    description: "Query Yuanbao groups, members, and DMs.",
  },
  [ToolsetId.ComputerUse]: {
    label: "Computer Use",
    description: "Drive the desktop via cua-driver on macOS, Windows, or Linux.",
  },
};

export function getToolsetLabel(id: ToolsetId): string {
  return TOOLSET_META[id].label;
}

export function getToolsetDescription(id: ToolsetId): string {
  return TOOLSET_META[id].description;
}

/** Ordered toolset list for UI rendering. Mirrors CONFIGURABLE_TOOLSETS order. */
export const TOOLSET_IDS: readonly ToolsetId[] = [
  ToolsetId.Web,
  ToolsetId.Browser,
  ToolsetId.Terminal,
  ToolsetId.File,
  ToolsetId.CodeExecution,
  ToolsetId.Vision,
  ToolsetId.Video,
  ToolsetId.ImageGen,
  ToolsetId.VideoGen,
  ToolsetId.XSearch,
  ToolsetId.Tts,
  ToolsetId.Skills,
  ToolsetId.Todo,
  ToolsetId.Memory,
  ToolsetId.ContextEngine,
  ToolsetId.SessionSearch,
  ToolsetId.Clarify,
  ToolsetId.Delegation,
  ToolsetId.Cronjob,
  ToolsetId.HomeAssistant,
  ToolsetId.Spotify,
  ToolsetId.Discord,
  ToolsetId.DiscordAdmin,
  ToolsetId.Yuanbao,
  ToolsetId.ComputerUse,
];

export function deriveToolsetAvailability(id: ToolsetId, agent: Agent): ToolsetAvailability {
  const config = agent.config;
  const env = agent.env ?? [];
  const hasEnv = (name: string) => env.some((v) => v.name === name && v.value.trim() !== "");

  switch (id) {
    case ToolsetId.Web: {
      const hasBackend = !!(
        config?.web?.backend ??
        config?.web?.search_backend ??
        config?.web?.extract_backend
      );
      return hasBackend
        ? { status: "available" }
        : { status: "unavailable", reason: "No web backend configured." };
    }
    case ToolsetId.XSearch: {
      // Gated on xAI credentials; off by default.
      const hasXaiKey = hasEnv("XAI_API_KEY");
      const xaiBackend = config?.web?.search_backend === "xai";
      return hasXaiKey || xaiBackend
        ? { status: "available" }
        : { status: "unavailable", reason: "Set XAI_API_KEY to opt in." };
    }
    case ToolsetId.Browser: {
      return config?.browser?.cloud_provider
        ? { status: "available" }
        : { status: "unavailable", reason: "No browser provider configured." };
    }
    case ToolsetId.HomeAssistant: {
      return hasEnv("HASS_TOKEN")
        ? { status: "available" }
        : { status: "unavailable", reason: "Set HASS_TOKEN to enable Home Assistant." };
    }
    case ToolsetId.Discord:
    case ToolsetId.DiscordAdmin: {
      return hasEnv("DISCORD_BOT_TOKEN")
        ? { status: "available" }
        : { status: "unavailable", reason: "Set DISCORD_BOT_TOKEN to enable Discord." };
    }
    case ToolsetId.ImageGen: {
      const hasFalKey = hasEnv("FAL_KEY");
      const useGateway = config?.image_gen?.use_gateway === true;
      return hasFalKey || useGateway
        ? { status: "available" }
        : { status: "unavailable", reason: "Set FAL_KEY or enable the managed gateway." };
    }
    case ToolsetId.VideoGen: {
      const hasFalKey = hasEnv("FAL_KEY");
      const hasXaiKey = hasEnv("XAI_API_KEY");
      return hasFalKey || hasXaiKey
        ? { status: "available" }
        : { status: "unavailable", reason: "Set FAL_KEY or XAI_API_KEY for video generation." };
    }
    case ToolsetId.Spotify:
      return { status: "unavailable", reason: "Spotify OAuth is not supported in Hermeum." };
    case ToolsetId.ComputerUse:
      return { status: "unavailable", reason: "Computer Use is not supported in Hermeum." };
    case ToolsetId.Yuanbao:
      return { status: "unavailable", reason: "Only available on the Yuanbao messaging platform." };
    default:
      // Toolsets with no config gate in Hermeum. They are available whenever
      // the agent exists; per-agent toggling is a follow-up.
      return { status: "available" };
  }
}