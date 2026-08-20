import { ReactNode, useState } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@hermeum/components/ui/tabs";

interface AgentEditorMobileTabsProps {
  chat: ReactNode;
  config: ReactNode;
}

// Mobile-only layout: the editor and chat each get a full tab so they can
// use the whole viewport instead of being squeezed into a 50/50 stack.
export function AgentEditorMobileTabs({ chat, config }: AgentEditorMobileTabsProps) {
  const [tab, setTab] = useState<"chat" | "config">("config");

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "chat" | "config")}
      className="flex min-h-0 flex-1 flex-col lg:hidden"
    >
      <TabsList className="shrink-0">
        <TabsTrigger value="config">Config</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
      </TabsList>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "chat" ? chat : config}
      </div>
    </Tabs>
  );
}
