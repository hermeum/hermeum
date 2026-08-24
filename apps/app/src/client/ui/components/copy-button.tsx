import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@hermeum/components/ui/button";
import { cn } from "@hermeum/components/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [text]
  );

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copy to clipboard"
      onClick={handleCopy}
      className={cn(
        "transition-opacity shrink-0",
        className
      )}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  );
}
