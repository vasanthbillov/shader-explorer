import { makeVariable } from "../engine/authoring";
import { useState } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type ShaderProject,
  type UniformDefinition,
  type AssetRecord,
  uniformSchema,
} from "../shared/types";
import { validateUniform } from "../engine/composition";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
export default function Parameters({
  project,
  edit,
  assets,
  onUpload,
  notify,
}: {
  project: ShaderProject;
  edit: (fn: (p: ShaderProject) => void) => void;
  assets: AssetRecord[];
  onUpload: () => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [variableError, setVariableError] = useState("");
  const [add, setAdd] = useState(false),
    [definition, setDefinition] = useState<UniformDefinition>({
      name: "uCustom",
      type: "float",
      group: "Custom",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    }),
    [presetName, setPresetName] = useState(""),
    [presetOpen, setPresetOpen] = useState(false),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = [...new Set(project.uniformDefinitions.map((u) => u.group))];
  function openNewVariable() {
    let name = "uCustom",
      i = 2;
    while (project.uniformDefinitions.some((d) => d.name === name))
      name = `uCustom${i++}`;
    setEditing(null);
    setVariableError("");
    setDefinition({
      name,
      type: "float",
      storage: "uniform",
      group: "Custom",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    });
    setAdd(true);
  }
  function reset(group?: string) {
    edit((p) => {
      for (const d of p.uniformDefinitions.filter(
        (d) => !group || d.group === group,
      ))
        p.uniforms[d.name] = structuredClone(d.default);
    });
  }
  function setValue(name: string, value: ShaderProject["uniforms"][string]) {
    edit((p) => {
      p.uniforms[name] = value;
    });
  }
  function numeric(def: UniformDefinition) {
    const value = Number(project.uniforms[def.name] ?? def.default);
    return (
      <>
        <input
          type="range"
          aria-label={`${def.name} slider`}
          min={def.min ?? 0}
          max={def.max ?? 10}
          step={def.step ?? (def.type === "int" ? 1 : 0.01)}
          value={value}
          onChange={(e) => setValue(def.name, Number(e.target.value))}
        />
        <input
          aria-label={def.name}
          className="number-input"
          type="number"
          min={def.min}
          max={def.max}
          step={def.step ?? (def.type === "int" ? 1 : 0.01)}
          value={value}
          onChange={(e) => {
            if (e.target.value === "") return;
            let v = Number(e.target.value);
            if (def.type === "int") v = Math.round(v);
            if (def.min !== undefined) v = Math.max(def.min, v);
            if (def.max !== undefined) v = Math.min(def.max, v);
            if (Number.isFinite(v)) setValue(def.name, v);
          }}
        />
      </>
    );
  }
  return (
    <section className="parameters-panel panel">
      <header className="panel-title">
        <h2>
          <SlidersHorizontal size={18} />
          Parameters
        </h2>
        <div className="row">
          <button
            className="icon-button"
            aria-label="New variable"
            title="New variable"
            onClick={openNewVariable}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Reset all parameters"
            onClick={() => reset()}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>
      <div className="parameter-groups">
        {groups.map((group) => {
          const effect = project.effects.find((e) => e.name === group);
          const closed = collapsed.includes(group);
          return (
            <div className="parameter-group" key={group}>
              <div className="parameter-group-header">
                <button
                  aria-expanded={!closed}
                  onClick={() =>
                    setCollapsed((c) =>
                      closed ? c.filter((x) => x !== group) : [...c, group],
                    )
                  }
                >
                  <ChevronDown
                    size={15}
                    className={closed ? "collapsed" : ""}
                  />
                  {group}
                </button>
                {effect ? (
                  <button
                    role="switch"
                    aria-checked={effect.enabled}
                    aria-label={`Enable ${group} effect`}
                    className={`toggle ${effect.enabled ? "on" : ""}`}
                    onClick={() =>
                      edit((p) => {
                        const e = p.effects.find((e) => e.id === effect.id)!;
                        e.enabled = !e.enabled;
                        if (
                          e.enabled &&
                          e.moduleId &&
                          !p.modules.some(
                            (m) => m.id === e.moduleId && m.enabled,
                          )
                        )
                          p.modules.push({
                            id: e.moduleId,
                            version: "1.0.0",
                            enabled: true,
                          });
                      })
                    }
                  >
                    <span />
                  </button>
                ) : (
                  <button
                    className="mini-icon"
                    title={`Reset ${group}`}
                    aria-label={`Reset ${group}`}
                    onClick={() => reset(group)}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
              {!closed && (
                <div className="parameter-fields">
                  {project.uniformDefinitions
                    .filter((u) => u.group === group)
                    .map((def) => (
                      <div
                        key={def.name}
                        className={`parameter-row ${def.type.startsWith("vec") || def.type === "sampler2D" ? "parameter-row-wide" : ""}`}
                      >
                        {def.storage === "constant" && (
                          <span
                            className="const-badge"
                            title="Constant · compile to update"
                          >
                            const
                          </span>
                        )}
                        <button
                          className="parameter-name"
                          title={`Reset ${def.name} to default`}
                          aria-label={`Reset ${def.name}`}
                          onClick={() =>
                            setValue(def.name, structuredClone(def.default))
                          }
                        >
                          {def.name
                            .replace(/^u(?=[A-Z])/, "")
                            .replace(/([a-z])([A-Z])/g, "$1 $2")}
                        </button>
                        {["float", "int"].includes(def.type) ? (
                          numeric(def)
                        ) : def.type === "bool" ? (
                          <input
                            aria-label={def.name}
                            type="checkbox"
                            checked={Boolean(project.uniforms[def.name])}
                            onChange={(e) =>
                              setValue(def.name, e.target.checked)
                            }
                          />
                        ) : def.type === "color" ? (
                          <div className="color-control">
                            <input
                              aria-label={def.name}
                              type="color"
                              value={String(
                                project.uniforms[def.name] || def.default,
                              )}
                              onChange={(e) =>
                                setValue(def.name, e.target.value)
                              }
                            />
                            <code>
                              {String(
                                project.uniforms[def.name] || def.default,
                              ).toUpperCase()}
                            </code>
                          </div>
                        ) : def.type === "sampler2D" ? (
                          <div className="texture-control">
                            <select
                              aria-label={def.name}
                              value={String(project.uniforms[def.name] || "")}
                              onChange={(e) =>
                                setValue(def.name, e.target.value)
                              }
                            >
                              <option value="">White texture</option>
                              {assets
                                .filter((a) => a.kind === "texture")
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              aria-label="Upload texture"
                              className="mini-icon"
                              onClick={onUpload}
                            >
                              <Upload size={14} />
                            </button>
                            <select
                              aria-label={`${def.name} wrapping`}
                              value={def.wrap || "repeat"}
                              onChange={(e) =>
                                edit((p) => {
                                  p.uniformDefinitions.find(
                                    (d) => d.name === def.name,
                                  )!.wrap = e.target.value as "repeat";
                                })
                              }
                            >
                              <option value="repeat">Repeat</option>
                              <option value="clamp">Clamp</option>
                              <option value="mirror">Mirror</option>
                            </select>
                            <select
                              aria-label={`${def.name} filtering`}
                              value={def.filter || "linear"}
                              onChange={(e) =>
                                edit((p) => {
                                  p.uniformDefinitions.find(
                                    (d) => d.name === def.name,
                                  )!.filter = e.target.value as "linear";
                                })
                              }
                            >
                              <option value="linear">Linear</option>
                              <option value="nearest">Nearest</option>
                            </select>
                            <select
                              aria-label={`${def.name} color space`}
                              value={def.colorSpace || "srgb"}
                              onChange={(e) =>
                                edit((p) => {
                                  p.uniformDefinitions.find(
                                    (d) => d.name === def.name,
                                  )!.colorSpace = e.target.value as "srgb";
                                })
                              }
                            >
                              <option value="srgb">sRGB</option>
                              <option value="linear">Linear</option>
                            </select>
                          </div>
                        ) : (
                          <div className="vector-control">
                            {(
                              (project.uniforms[def.name] as number[]) ||
                              (def.default as number[])
                            ).map((v, i) => (
                              <input
                                key={i}
                                type="number"
                                step="0.01"
                                aria-label={`${def.name} ${"xyzw"[i]}`}
                                value={v}
                                onChange={(e) => {
                                  const a = [
                                    ...(project.uniforms[def.name] as number[]),
                                  ];
                                  a[i] = Number(e.target.value);
                                  if (Number.isFinite(a[i]))
                                    setValue(def.name, a);
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="parameter-bottom">
        <Button size="sm" onClick={openNewVariable}>
          <Plus size={14} />
          New Variable
        </Button>
        <Button size="sm" onClick={() => setPresetOpen(true)}>
          Presets <span className="count-badge">{project.presets.length}</span>
        </Button>
      </div>
      <div className="bloom-control">
        <label htmlFor="preview-bloom">
          Bloom <span>Soft glow around bright colors</span>
        </label>
        <button
          id="preview-bloom"
          role="switch"
          aria-label="Preview bloom"
          aria-checked={project.preview.bloom ?? false}
          className={`toggle ${project.preview.bloom ? "on" : ""}`}
          onClick={() =>
            edit((p) => {
              p.preview.bloom = !(p.preview.bloom ?? false);
            })
          }
        >
          <span />
        </button>
      </div>
      <div className="preview-options">
        <label>
          Speed
          <select
            aria-label="Animation speed"
            value={project.preview.speed}
            onChange={(e) =>
              edit((p) => {
                p.preview.speed = Number(e.target.value);
              })
            }
          >
            {[0.25, 0.5, 1, 1.5, 2].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Quality
          <select
            aria-label="Preview quality"
            value={project.preview.quality}
            onChange={(e) =>
              edit((p) => {
                p.preview.quality = e.target.value as "standard";
              })
            }
          >
            <option value="standard">Standard</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <Dialog
        open={add}
        onOpenChange={setAdd}
        title={editing ? "Edit variable" : "New variable"}
        description="Uniforms update live. Constants change on compilation. Both are available to your shader bodies and custom functions."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const d = makeVariable(project, definition, editing);
              edit((p) => {
                if (editing) {
                  const index = p.uniformDefinitions.findIndex(
                    (u) => u.name === editing,
                  );
                  p.uniformDefinitions[index] = d;
                  const old = p.uniforms[editing];
                  delete p.uniforms[editing];
                  try {
                    validateUniform(d, old);
                    p.uniforms[d.name] = old;
                  } catch {
                    p.uniforms[d.name] = structuredClone(d.default);
                  }
                } else {
                  p.uniformDefinitions.push(d);
                  p.uniforms[d.name] = structuredClone(d.default);
                }
              });
              setAdd(false);
            } catch (err) {
              setVariableError(
                err instanceof Error ? err.message : String(err),
              );
            }
          }}
        >
          <label className="field-label">
            Variable name
            <input
              required
              pattern="[a-zA-Z_]\w*"
              value={definition.name}
              onChange={(e) =>
                setDefinition((d) => ({ ...d, name: e.target.value }))
              }
            />
          </label>
          <label className="field-label">
            Variable kind
            <select
              aria-label="Variable kind"
              value={definition.storage || "uniform"}
              onChange={(e) =>
                setDefinition((d) => ({
                  ...d,
                  storage: e.target.value as "uniform" | "constant",
                }))
              }
            >
              <option value="uniform">Uniform — adjustable live</option>
              <option
                value="constant"
                disabled={definition.type === "sampler2D"}
              >
                Constant — requires compilation
              </option>
            </select>
          </label>
          <div className="form-grid">
            <label className="field-label">
              Type
              <select
                aria-label="Variable type"
                value={definition.type}
                onChange={(e) => {
                  const type = e.target.value as UniformDefinition["type"];
                  setDefinition((d) => ({
                    name: d.name,
                    group: d.group,
                    storage: type === "sampler2D" ? "uniform" : d.storage,
                    type,
                    default:
                      type === "color"
                        ? "#b99cff"
                        : type === "sampler2D"
                          ? ""
                          : type === "bool"
                            ? false
                            : type.startsWith("vec")
                              ? Array(Number(type.slice(3))).fill(0)
                              : 0,
                    ...(["float", "int"].includes(type)
                      ? { min: 0, max: 10, step: type === "int" ? 1 : 0.01 }
                      : {}),
                  }));
                }}
              >
                {[
                  "float",
                  "int",
                  "bool",
                  "vec2",
                  "vec3",
                  "vec4",
                  "color",
                  "sampler2D",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Group
              <input
                required
                value={definition.group}
                onChange={(e) =>
                  setDefinition((d) => ({ ...d, group: e.target.value }))
                }
              />
            </label>
          </div>
          {["float", "int"].includes(definition.type) && (
            <div className="form-grid">
              {(["default", "min", "max", "step"] as const).map((k) => (
                <label className="field-label" key={k}>
                  {k}
                  <input
                    type="number"
                    step="any"
                    value={Number(definition[k] ?? 0)}
                    onChange={(e) =>
                      setDefinition((d) => ({
                        ...d,
                        [k]: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          {definition.type === "bool" && (
            <label className="field-label">
              Default value
              <select
                value={String(definition.default)}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    default: e.target.value === "true",
                  }))
                }
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>
          )}
          {definition.type === "color" && (
            <label className="field-label">
              Default color
              <input
                type="color"
                value={String(definition.default)}
                onChange={(e) =>
                  setDefinition((d) => ({ ...d, default: e.target.value }))
                }
              />
            </label>
          )}
          {definition.type.startsWith("vec") && (
            <fieldset className="vector-defaults">
              <legend>Default components</legend>
              <div className="form-grid">
                {(definition.default as number[]).map((value, i) => (
                  <label className="field-label" key={i}>
                    {"xyzw"[i]}
                    <input
                      type="number"
                      step="any"
                      required
                      value={value}
                      onChange={(e) =>
                        setDefinition((d) => {
                          const next = [...(d.default as number[])];
                          next[i] = Number(e.target.value);
                          return { ...d, default: next };
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {definition.type === "sampler2D" && (
            <label className="field-label">
              Default texture
              <select
                value={String(definition.default)}
                onChange={(e) =>
                  setDefinition((d) => ({ ...d, default: e.target.value }))
                }
              >
                <option value="">White texture</option>
                {assets
                  .filter((a) => a.kind === "texture")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <p className="authoring-hint">
            {definition.storage === "constant"
              ? "A const declaration is generated. Compile after changing its value."
              : "A uniform declaration is generated. Use its name in your GLSL to control the result."}{" "}
            Renaming does not rewrite existing code.
          </p>
          {variableError && (
            <div role="alert" className="authoring-error">
              {variableError}
            </div>
          )}
          <Button type="submit" variant="default">
            {editing ? "Update Variable" : "Add Variable"}
          </Button>
        </form>
        <h3 className="uniform-manager-title">Existing variables</h3>
        <div className="uniform-manager-list">
          {project.uniformDefinitions.map((d) => (
            <div className="row spread" key={d.name}>
              <code>
                {d.name}{" "}
                <span className="muted">
                  {d.storage === "constant" ? "const " : ""}
                  {d.type}
                </span>
              </code>
              <div className="row">
                <Button
                  size="sm"
                  onClick={() => {
                    setVariableError("");
                    setEditing(d.name);
                    setDefinition(structuredClone(d));
                  }}
                >
                  Edit
                </Button>
                <button
                  className="mini-icon"
                  aria-label={`Delete uniform ${d.name}`}
                  onClick={() =>
                    edit((p) => {
                      p.uniformDefinitions = p.uniformDefinitions.filter(
                        (u) => u.name !== d.name,
                      );
                      delete p.uniforms[d.name];
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={presetOpen}
        onOpenChange={setPresetOpen}
        title="Parameter presets"
      >
        <div className="version-list">
          {project.presets.map((preset, i) => (
            <div className="version-item" key={i}>
              <strong>{preset.name}</strong>
              <Button
                size="sm"
                onClick={() =>
                  edit((p) => {
                    p.uniforms = structuredClone(preset.values);
                  })
                }
              >
                Apply
              </Button>
              <button
                className="mini-icon"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() =>
                  edit((p) => {
                    p.presets.splice(i, 1);
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            edit((p) => {
              p.presets.push({
                name: presetName.trim(),
                values: structuredClone(p.uniforms),
              });
            });
            setPresetName("");
          }}
        >
          <label className="field-label">
            New preset name
            <input
              required
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </label>
          <Button type="submit" variant="default">
            Save Current Values
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
