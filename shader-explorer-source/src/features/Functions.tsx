import NewFunctionDialog from "./NewFunctionDialog";
import { useState } from "react";
import {
  Search,
  Plus,
  ChevronDown,
  Code2,
  Copy,
  Trash2,
  Info,
  Link2,
} from "lucide-react";
import { modules as builtins, moduleCategories } from "../content/modules";
import {
  type ShaderProject,
  type ShaderModuleVersion,
  uid,
} from "../shared/types";
import { resolveModules } from "../engine/composition";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
export function FunctionPanel({
  project,
  edit,
  selected,
  onSelect,
  onCreated,
  notify,
}: {
  project: ShaderProject;
  edit: (fn: (p: ShaderProject) => void) => void;
  selected: string;
  onSelect: (id: string) => void;
  onCreated: (module: ShaderModuleVersion) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(["Core", "Noise", "Lighting"]),
    [add, setAdd] = useState(false),
    [create, setCreate] = useState(false),
    [search, setSearch] = useState("");
  const registry = [...builtins, ...project.customModules];
  let resolved: ShaderModuleVersion[] = [];
  try {
    resolved = resolveModules(project);
  } catch {
    /* Composition diagnostics are displayed by the editor. */
  }
  const inProject = registry.filter(
    (m) =>
      project.modules.some((r) => r.id === m.id && r.version === m.version) ||
      resolved.some((r) => r.id === m.id && r.version === m.version),
  );
  function toggle(m: ShaderModuleVersion) {
    const ref = project.modules.find(
      (r) => r.id === m.id && r.version === m.version,
    );
    if (ref?.enabled || !ref) {
      const copy = structuredClone(project);
      copy.modules = copy.modules.filter((r) => r.id !== m.id);
      try {
        if (resolveModules(copy).some((r) => r.id === m.id))
          throw Error(`${m.name} is required by an active function or effect.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
        return;
      }
      if (!ref) {
        notify(`${m.name} is a required dependency.`);
        return;
      }
    }
    edit((p) => {
      const ref = p.modules.find(
        (r) => r.id === m.id && r.version === m.version,
      );
      if (ref) ref.enabled = !ref.enabled;
      else p.modules.push({ id: m.id, version: m.version, enabled: true });
    });
  }
  function remove(m: ShaderModuleVersion) {
    const copy = structuredClone(project);
    copy.modules = copy.modules.filter((r) => r.id !== m.id);
    try {
      if (resolveModules(copy).some((r) => r.id === m.id))
        throw Error(`${m.name} is required by another function or effect.`);
      edit((p) => {
        p.modules = p.modules.filter((r) => r.id !== m.id);
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <aside className="function-panel panel">
      <header className="panel-title">
        <h2>
          <Code2 size={18} />
          Shader Functions
        </h2>
        <button
          className="mini-icon"
          aria-label="New custom function"
          onClick={() => setCreate(true)}
        >
          <Plus size={16} />
        </button>
      </header>
      <label className="search-field function-search">
        <Search size={15} />
        <input
          aria-label="Search active functions"
          placeholder="Search function…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="function-groups">
        {[...moduleCategories, "Custom"].map((category) => {
          const group = inProject.filter(
            (m) =>
              (m.builtin ? m.category : "Custom") === category &&
              `${m.name} ${m.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          );
          const closed = !open.includes(category);
          return (
            <section className="function-group" key={category}>
              <button
                className="function-group-title"
                aria-expanded={!closed}
                onClick={() =>
                  setOpen((o) =>
                    closed ? [...o, category] : o.filter((x) => x !== category),
                  )
                }
              >
                <ChevronDown className={closed ? "collapsed" : ""} size={15} />
                <strong>{category}</strong>
                <span>{group.length}</span>
              </button>
              {!closed && (
                <div className="function-items">
                  {group.map((m) => {
                    const active = resolved.some((r) => r.id === m.id);
                    const dependency = !project.modules.some(
                      (r) => r.id === m.id && r.enabled,
                    );
                    return (
                      <div
                        className={`function-item ${selected === m.id ? "selected" : ""}`}
                        key={`${m.id}@${m.version}`}
                      >
                        <button
                          className="function-select"
                          onClick={() => onSelect(m.id)}
                        >
                          <span className="function-symbol">ƒ</span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>
                              {dependency ? (
                                <>
                                  <Link2 size={10} />
                                  Required dependency
                                </>
                              ) : (
                                m.description
                              )}
                            </small>
                          </span>
                        </button>
                        <button
                          className={`toggle ${active ? "on" : ""}`}
                          role="switch"
                          aria-label={`Include ${m.name}`}
                          aria-checked={active}
                          onClick={() => toggle(m)}
                        >
                          <span />
                        </button>
                        <button
                          className="mini-icon remove-function"
                          aria-label={`Remove ${m.name}`}
                          onClick={() => remove(m)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {!group.length && (
                    <p className="group-empty">No functions added</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="function-panel-bottom">
        <span>
          <span className="tiny-dot" />
          {resolved.length} functions in build
        </span>
        <Button variant="default" onClick={() => setCreate(true)}>
          <Plus size={18} />
          New Function
        </Button>
        <Button onClick={() => setAdd(true)}>Browse Library</Button>
        <p>Functions become available to call in your shader.</p>
      </div>
      {create && (
        <NewFunctionDialog
          project={project}
          onClose={() => setCreate(false)}
          onCreate={(module) => {
            edit((p) => {
              p.customModules.push(module);
              p.modules.push({
                id: module.id,
                version: module.version,
                enabled: true,
              });
            });
            setOpen((o) => [...new Set([...o, "Custom"])]);
            setQuery("");
            setCreate(false);
            onSelect(module.id);
            onCreated(module);
            notify(
              `${module.name} created. Call it in your shader and compile.`,
            );
          }}
        />
      )}
      <Dialog
        wide
        open={add}
        onOpenChange={setAdd}
        title="Function library"
        description="Choose a reusable building block. Dependencies are included automatically."
      >
        <Button
          className="library-create-function"
          variant="default"
          onClick={() => {
            setAdd(false);
            setCreate(true);
          }}
        >
          <Plus size={15} />
          New Custom Function
        </Button>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search all 24 built-in functions…"
            aria-label="Search function library"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="module-library">
          {registry
            .filter((m) =>
              `${m.name} ${m.description} ${m.category}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((m) => (
              <article key={`${m.id}@${m.version}`}>
                <span className="function-symbol">ƒ</span>
                <div>
                  <strong>{m.name}</strong>
                  <span className="tag">{m.category}</span>
                  <p>{m.description}</p>
                  <code>{m.usage}</code>
                </div>
                <Button
                  size="sm"
                  disabled={project.modules.some(
                    (r) => r.id === m.id && r.enabled,
                  )}
                  onClick={() => {
                    edit((p) => {
                      const r = p.modules.find((r) => r.id === m.id);
                      if (r) {
                        r.enabled = true;
                        r.version = m.version;
                      } else
                        p.modules.push({
                          id: m.id,
                          version: m.version,
                          enabled: true,
                        });
                    });
                    onSelect(m.id);
                    notify(
                      `${m.name} added. Call it from your shader, then compile.`,
                    );
                  }}
                >
                  {project.modules.some((r) => r.id === m.id && r.enabled) ? (
                    "Added"
                  ) : (
                    <>
                      <Plus size={14} />
                      Add
                    </>
                  )}
                </Button>
              </article>
            ))}
        </div>
      </Dialog>
    </aside>
  );
}
export function FunctionDetails({
  module,
  project,
  edit,
  onEditSource,
  notify,
}: {
  module?: ShaderModuleVersion;
  project: ShaderProject;
  edit: (fn: (p: ShaderProject) => void) => void;
  onEditSource: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [duplicate, setDuplicate] = useState(false),
    [symbol, setSymbol] = useState(""),
    [source, setSource] = useState(""),
    [usage, setUsage] = useState(""),
    [dependencies, setDependencies] = useState<
      ShaderModuleVersion["dependencies"]
    >([]);
  if (!module)
    return (
      <section className="panel function-details">
        <header className="panel-title">
          <h2>ƒ Function Controls</h2>
          <Info size={16} />
        </header>
        <p className="muted">
          Select a function to inspect its source, dependencies, and usage.
        </p>
      </section>
    );
  return (
    <section className="panel function-details">
      <header className="panel-title">
        <h2>ƒ Function Controls</h2>
        <Info size={16} />
      </header>
      <div className="function-details-content">
        <div className="row spread">
          <strong className="function-detail-name">{module.name}</strong>
          <span className="tag">{module.version}</span>
        </div>
        <p>{module.description}</p>
        <h3>Usage example</h3>
        <pre>{module.usage}</pre>
        <div className="dependency-list">
          <span>Dependencies</span>
          <strong>
            {module.dependencies
              .map((d) => `${d.id}@${d.version}`)
              .join(", ") || "None"}
          </strong>
        </div>
        <div className="dependency-list">
          <span>Attribution</span>
          <strong>
            {module.author} · {module.license}
          </strong>
        </div>
        <div className="row">
          <Button
            size="sm"
            onClick={() => {
              if (module.builtin) {
                setSource(module.source);
                setUsage(module.usage);
                setDependencies(structuredClone(module.dependencies));
                setSymbol(`${module.exports[0]}Custom`);
                setDuplicate(true);
              } else onEditSource(module.id);
            }}
          >
            <Code2 size={14} />
            {module.builtin ? "Customize" : "Edit source"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSource(module.source);
              setUsage(module.usage);
              setDependencies(structuredClone(module.dependencies));
              setSymbol(`${module.exports[0]}Copy`);
              setDuplicate(true);
            }}
          >
            <Copy size={13} />
            Copy
          </Button>
        </div>
      </div>
      <Dialog
        wide
        open={duplicate}
        onOpenChange={setDuplicate}
        title="Create independent function"
        description="Rename exported symbols in your source explicitly before activating. Existing calls and dependencies are not rewritten."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !/^[a-zA-Z_]\w*$/.test(symbol) ||
              [...builtins, ...project.customModules].some((m) =>
                m.exports.includes(symbol),
              )
            ) {
              notify("Choose a unique exported GLSL name.");
              return;
            }
            if (!new RegExp(`\\b${symbol}\\s*\\(`).test(source)) {
              notify(
                "Update the function declaration in the source to match your exported name.",
              );
              return;
            }
            const id = uid();
            edit((p) => {
              p.customModules.push({
                ...structuredClone(module),
                id,
                version: "1.0.0",
                name: `${symbol}()`,
                exports: [symbol],
                source,
                usage,
                dependencies,
                builtin: false,
                author: "Local artist",
                category: "Custom",
              });
              p.modules.push({ id, version: "1.0.0", enabled: true });
            });
            setDuplicate(false);
            onEditSource(id);
          }}
        >
          <label className="field-label">
            Exported function name
            <input
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </label>
          <label className="field-label">
            GLSL source
            <textarea
              className="source-textarea"
              rows={9}
              spellCheck={false}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="field-label">
            Usage example
            <input
              required
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
            />
          </label>
          <label className="field-label">
            Dependencies
            <select
              multiple
              value={dependencies.map((d) => `${d.id}@${d.version}`)}
              onChange={(e) =>
                setDependencies(
                  [...e.target.selectedOptions].map((o) => {
                    const m = [...builtins, ...project.customModules].find(
                      (m) => `${m.id}@${m.version}` === o.value,
                    )!;
                    return { id: m.id, version: m.version };
                  }),
                )
              }
            >
              {[...builtins, ...project.customModules].map((m) => (
                <option
                  key={`${m.id}@${m.version}`}
                  value={`${m.id}@${m.version}`}
                >
                  {m.name} {m.version}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="default">
            Create Function
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
