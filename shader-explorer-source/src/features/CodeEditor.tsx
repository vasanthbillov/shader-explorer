import "monaco-editor/esm/vs/editor/edcore.main.js";
import { useEffect, useRef } from "react";
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type { Diagnostic } from "../shared/types";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
let registered = false;
function register() {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: "glsl" });
  monaco.languages.setMonarchTokensProvider("glsl", {
    keywords: [
      "void",
      "float",
      "int",
      "bool",
      "vec2",
      "vec3",
      "vec4",
      "mat2",
      "mat3",
      "mat4",
      "uniform",
      "in",
      "out",
      "inout",
      "const",
      "return",
      "if",
      "else",
      "for",
      "while",
      "discard",
      "precision",
      "highp",
      "sampler2D",
      "true",
      "false",
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/#\w+/, "keyword"],
        [/\b\d*\.?\d+(?:e[-+]?\d+)?\b/, "number"],
        [
          /[a-zA-Z_]\w*/,
          { cases: { "@keywords": "keyword", "@default": "identifier" } },
        ],
        [/[{}()[\]]/, "@brackets"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });
  monaco.editor.defineTheme("shader-night", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C49BFF" },
      { token: "number", foreground: "FFAD87" },
      { token: "comment", foreground: "63718B", fontStyle: "italic" },
      { token: "identifier", foreground: "B6E7EF" },
    ],
    colors: {
      "editor.background": "#0C111D",
      "editorLineNumber.foreground": "#49536B",
      "editorLineNumber.activeForeground": "#C5ACF5",
      "editor.selectionBackground": "#6439A755",
      "editor.lineHighlightBackground": "#151D2D",
      "editorCursor.foreground": "#BF8AFF",
      "editorGutter.background": "#0C111D",
    },
  });
}
register();
export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  path,
  diagnostics = [],
  suggestions = [],
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  path: string;
  diagnostics?: Diagnostic[];
  suggestions?: string[];
}) {
  const ref = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const completion = useRef<monaco.IDisposable | null>(null);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const ownedModels = useRef(new Set<monaco.editor.ITextModel>());
  const modelListener = useRef<monaco.IDisposable | null>(null);
  const mount: OnMount = (editor) => {
    ref.current = editor;
    const own = () => {
      const model = editor.getModel();
      if (model) ownedModels.current.add(model);
    };
    own();
    modelListener.current = editor.onDidChangeModel(own);
    completion.current?.dispose();
    completion.current = monaco.languages.registerCompletionItemProvider(
      "glsl",
      {
        provideCompletionItems: (model, pos) => {
          const word = model.getWordUntilPosition(pos);
          return {
            suggestions: [
              ...new Set([
                "uTime",
                "uDelta",
                "uResolution",
                "uPointer",
                "uv",
                "position",
                "normal",
                "viewDir",
                "color",
                "localPosition",
                ...suggestionsRef.current,
              ]),
            ].map((label) => ({
              label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: label,
              range: {
                startLineNumber: pos.lineNumber,
                endLineNumber: pos.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              },
            })),
          };
        },
      },
    );
  };
  useEffect(() => {
    const model = ref.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "glsl",
      diagnostics.map((d) => ({
        severity:
          d.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line || 1,
        endLineNumber: d.line || 1,
        startColumn: 1,
        endColumn: 1000,
      })),
    );
  }, [diagnostics, path]);
  useEffect(
    () => () => {
      completion.current?.dispose();
      modelListener.current?.dispose();
      for (const model of ownedModels.current)
        if (!model.isDisposed()) model.dispose();
    },
    [],
  );
  return (
    <MonacoEditor
      height="100%"
      language="glsl"
      theme="shader-night"
      path={path}
      value={value}
      onChange={(v) => onChange?.(v || "")}
      onMount={mount}
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        lineHeight: 23,
        minimap: { enabled: false },
        padding: { top: 16, bottom: 20 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        renderLineHighlight: "line",
        fixedOverflowWidgets: true,
      }}
      loading={<div className="empty-state">Loading code editor…</div>}
    />
  );
}
