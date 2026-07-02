import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { cn } from "@hermeum/components/lib/utils";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  maxHeight?: string;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  invalid = false,
  maxHeight,
}: CodeEditorProps) {
  return (
    <CodeMirror
      value={value}
      extensions={[yamlLang()]}
      {...(onChange !== undefined && { onChange })}
      editable={!readOnly}
      {...(maxHeight !== undefined && { maxHeight })}
      style={{ wordSpacing: "2.5px" }}
      basicSetup={{
        lineNumbers: false,
        foldGutter: readOnly,
        searchKeymap: false,
        autocompletion: false,
        lintKeymap: false,
      }}
      className={cn(
        "overflow-hidden rounded-[0.25rem] border text-sm [&_.cm-content]:outline-none [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-sans!",
        invalid && "border-destructive"
      )}
    />
  );
}
