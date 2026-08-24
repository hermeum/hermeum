import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { cn } from "@hermeum/components/lib/utils";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  maxHeight?: string;
  height?: string;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  invalid = false,
  maxHeight,
  height,
}: CodeEditorProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[0.25rem] border text-sm",
        // With a percentage height the border must span the parent, not the content.
        height !== undefined && "h-full",
        invalid && "border-destructive"
      )}
    >
      <CodeMirror
        value={value}
        extensions={[yamlLang(), EditorView.lineWrapping]}
        {...(onChange !== undefined && { onChange })}
        editable={!readOnly}
        {...(maxHeight !== undefined && { maxHeight })}
        {...(height !== undefined && { height })}
        style={{ wordSpacing: "2.5px" }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
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
  );
}
