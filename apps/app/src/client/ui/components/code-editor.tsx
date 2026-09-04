import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { unifiedMergeView } from "@codemirror/merge";
import { cn } from "@hermeum/components/lib/utils";
import { CopyButton } from "@/client/ui/components/copy-button";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  maxHeight?: string;
  height?: string;
  title?: React.ReactNode;
  foldable?: boolean;
  originalValue?: string;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  invalid = false,
  maxHeight,
  height,
  title,
  foldable = false,
  originalValue,
}: CodeEditorProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[0.25rem] border text-sm",
        // With a percentage height the border must span the parent, not the content.
        height !== undefined && "h-full",
        title !== undefined && "flex flex-col",
        invalid && "border-destructive"
      )}
    >
      {title !== undefined && (
        <div className="flex h-8 shrink-0 items-center gap-1 pl-3 pr-1 text-sm font-medium">
          <div className="min-w-0 flex-1 truncate">{title}</div>
          <CopyButton text={value} />
        </div>
      )}
      <div className={cn("min-w-0", title !== undefined && "min-h-0 flex-1")}>
        <CodeMirror
          value={value}
          extensions={[
            yamlLang(),
            EditorView.lineWrapping,
            ...(originalValue !== undefined && !readOnly
              ? [
                  unifiedMergeView({
                    original: originalValue,
                    // Show the diff (line highlights + deleted-content
                    // widgets) without merge interactivity or text-level
                    // underline marks.
                    highlightChanges: false,
                    mergeControls: false,
                  }),
                ]
              : []),
          ]}
          {...(onChange !== undefined && { onChange })}
          editable={!readOnly}
          {...(maxHeight !== undefined && { maxHeight })}
          {...(height !== undefined && { height })}
          style={{ wordSpacing: "2.5px" }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: foldable,
            searchKeymap: false,
            autocompletion: false,
            lintKeymap: false,
            highlightActiveLine: !readOnly,
            highlightActiveLineGutter: !readOnly,
          }}
          className={cn(
            "h-full [&_.cm-content]:outline-none [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-sans! [&_.cm-scroller]:overflow-auto! [&_.cm-line]:py-[0.15rem]! [&_.cm-gutters]:border-r-0! [&_.cm-gutters]:bg-transparent! [&_.cm-gutterElement]:pl-3! [&_.cm-gutterElement]:pr-2! [&_.cm-gutterElement]:text-muted-foreground/60"
          )}
        />
      </div>
    </div>
  );
}
