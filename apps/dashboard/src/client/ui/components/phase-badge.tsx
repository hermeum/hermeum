import { cn } from "@clawagent/components/lib/utils";
import type { InstancePhase } from "@/entities";

function phaseClass(phase: InstancePhase | undefined): string {
  switch (phase) {
    case "Running":
      return "bg-green-100 text-green-800";
    case "Pending":
    case "Provisioning":
    case "Updating":
    case "Restoring":
    case "BackingUp":
      return "bg-yellow-100 text-yellow-800";
    case "Failed":
    case "Degraded":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

interface PhaseBadgeProps {
  phase: InstancePhase | undefined;
  className?: string;
}

export function PhaseBadge({ phase, className }: PhaseBadgeProps) {
  if (!phase) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        phaseClass(phase),
        className
      )}
    >
      {phase}
    </span>
  );
}
