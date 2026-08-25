import { cn } from "@hermeum/components/lib/utils";
import type { AgentPhase } from "@/entities";

function phaseClass(phase: AgentPhase | undefined): string {
  switch (phase) {
    case "Running":
      return "bg-green-100 text-green-800";
    case "Pending":
      return "bg-yellow-100 text-yellow-800";
    case "Succeeded":
      return "bg-blue-100 text-blue-800";
    case "Failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

interface PhaseBadgeProps {
  phase: AgentPhase | undefined;
  reason?: string | undefined;
  className?: string;
}

export function PhaseBadge({ phase, reason, className }: PhaseBadgeProps) {
  if (!phase) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-xs font-medium",
        phaseClass(phase),
        className
      )}
    >
      {phase}
      {reason && <span className="font-normal opacity-80">&nbsp;by&nbsp;{reason}</span>}
    </span>
  );
}
