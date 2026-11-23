import { useState } from "react";
import { Code2, AlertCircle } from "lucide-react";
import { type ShaderProject, type ShaderModuleVersion } from "../shared/types";
import { modules } from "../content/modules";
import {
  makeCustomFunction,
  functionTemplate,
  functionUsage,
} from "../engine/authoring";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
export default function NewFunctionDialog({
  project,
  onClose,
  onCreate,
}: {
  project: ShaderProject;
  onClose: () => void;
  onCreate: (module: ShaderModuleVersion) => void;
}) {
  const registry = [...modules, ...project.customModules];
  const [symbol, setSymbol] = useState(() => {
    let name = "customColor",
      i = 2;
    while (registry.some((m) => m.exports.includes(name)))
      name = `customColor${i++}`;
    return name;
  });
  const [source, setSource] = useState(() => functionTemplate(symbol)),
    [usage, setUsage] = useState(() => functionUsage(symbol)),
    [description, setDescription] = useState(
      "A custom procedural color function.",
    ),
    [stages, setStages] = useState<ShaderModuleVersion["stages"]>(["fragment"]),
    [dependencies, setDependencies] = useState<
      ShaderModuleVersion["dependencies"]
    >([]),
    [error, setError] = useState("");
  return (
    <Dialog
      wide
      open
      onOpenChange={(open) => !open && onClose()}
      title="New custom function"
      description="Write a complete GLSL function, choose its stages, then call it from your shader. Dependencies are included automatically."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const module = makeCustomFunction(project, {
              symbol,
              source,
              usage,
              description,
              stages,
              dependencies,
            });
            onCreate(module);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <div className="form-grid">
          <label className="field-label">
            Function name
            <input
              aria-label="Function name"
              autoFocus
              required
              maxLength={80}
              value={symbol}
              onChange={(e) => {
                const name = e.target.value;
                if (source === functionTemplate(symbol))
                  setSource(functionTemplate(name));
                if (usage === functionUsage(symbol))
                  setUsage(functionUsage(name));
                setSymbol(name);
                setError("");
              }}
              spellCheck={false}
            />
          </label>
          <label className="field-label">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>
        </div>
        <fieldset className="stage-picker">
          <legend>Available in</legend>
          {(["fragment", "vertex"] as const).map((stage) => (
            <label key={stage}>
              <input
                type="checkbox"
                checked={stages.includes(stage)}
                onChange={(e) =>
                  setStages((s) =>
                    e.target.checked
                      ? [...s, stage]
                      : s.filter((x) => x !== stage),
                  )
                }
              />
              {stage === "fragment" ? "Fragment shader" : "Vertex shader"}
            </label>
          ))}
        </fieldset>
        <label className="field-label">
          GLSL function source
          <textarea
            aria-label="GLSL function source"
            className="source-textarea"
            rows={9}
            required
            maxLength={100000}
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <label className="field-label">
          Usage example
          <input
            aria-label="Usage example"
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Function dependencies{" "}
          <span className="muted">
            Optional · Ctrl/Cmd-click to select multiple
          </span>
          <select
            multiple
            size={4}
            value={dependencies.map((d) => `${d.id}@${d.version}`)}
            onChange={(e) =>
              setDependencies(
                [...e.target.selectedOptions].map((option) => {
                  const m = registry.find(
                    (m) => `${m.id}@${m.version}` === option.value,
                  )!;
                  return { id: m.id, version: m.version };
                }),
              )
            }
          >
            {registry.map((m) => (
              <option
                key={`${m.id}@${m.version}`}
                value={`${m.id}@${m.version}`}
              >
                {m.name} · {m.category}
              </option>
            ))}
          </select>
        </label>
        <p className="authoring-hint">
          Use New Variable in Parameters to declare custom uniforms or
          constants. A function only affects the result after you call it in the
          shader body.
        </p>
        {error && (
          <div className="authoring-error" role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        <div className="row">
          <Button type="submit" variant="default">
            <Code2 size={15} />
            Create Function
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
