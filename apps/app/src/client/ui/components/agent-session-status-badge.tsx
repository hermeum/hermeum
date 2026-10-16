import { Badge } from "@hermeum/components/ui/badge";
import { cn } from "@hermeum/components/lib/utils";

import type { AgentSessionStatus } from "@/entities";

interface AgentSessionStatusBadgeProps {
  status: AgentSessionStatus;
  className?: string;
}

export function AgentSessionStatusBadge({ status, className }: AgentSessionStatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn(status === "active" && "text-green-700", className)}>
      {status === "active" ? "Active" : status === "inactive" ? "Inactive" : "Finalized"}
    </Badge>
  );
}