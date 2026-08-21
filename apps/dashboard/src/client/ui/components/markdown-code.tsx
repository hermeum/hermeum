import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { ExtraProps } from "streamdown";

import { Button } from "@hermeum/components/ui/button";
import { cn } from "@hermeum/components/lib/utils";
import { useIsCodeFenceIncomplete } from "streamdown";

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: "sh",
  css: "css",
  go: "go",
  html: "html",
  javascript: "js",
  json: "json",
  jsx: "jsx",
  markdown: "md",
  md: "md",
  python: "py",
  rust: "rs",
  sh: "sh",
  shell: "sh",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  yaml: "yaml",
  yml: "yml",
  zsh: "zsh",
};

export function MarkdownInlineCode({
  className,
  children,
  ...props
}: React.ComponentProps<"code"> & ExtraProps) {
  return (
    <code
      className={cn(
        "rounded-sm bg-muted px-1 py-0.5 font-mono text-xs",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}

export function MarkdownCode({
  className,
  children,
  ...props
}: React.ComponentProps<"code"> & ExtraProps) {
  const isIncomplete = useIsCodeFenceIncomplete();
  const [copied, setCopied] = useState(false);

  const text = String(children ?? "");
  const language = className?.match(/language-(\S+)/)?.[1] ?? "text";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail in insecure contexts; ignore.
    }
  }

  function handleDownload() {
    const ext = LANGUAGE_EXTENSIONS[language] ?? "txt";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (isIncomplete) {
    return (
      <div className="overflow-hidden rounded-md border bg-muted p-3">
        <pre className="m-0 overflow-x-auto text-sm">
          <code {...props}>{children}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-muted">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{language}</span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={copied ? "Copied" : "Copy code"}
            onClick={handleCopy}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Download code"
            onClick={handleDownload}
          >
            <Download />
          </Button>
        </div>
      </div>
      <pre className="m-0 overflow-x-auto p-3 text-sm">
        <code {...props}>{children}</code>
      </pre>
    </div>
  );
}
