import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Code2,
  Save,
  Download,
  ChevronDown,
  Play,
  RotateCcw,
  History,
  Copy,
  Check,
  AlertCircle,
  Plus,
  Upload,
  Settings2,
  X,
  FileCode2,
  Terminal,
  SlidersHorizontal,
  Layers,
  Trash2,
} from "lucide-react";
import { useData } from "../app/context";
import { useSession } from "../app/store";
import {
  type ShaderProject,
  type AssetRecord,
  type Draft,
  type ProjectVersion,
  type ShaderModuleVersion,
  categories,
  uid,
  now,
} from "../shared/types";
import { modules } from "../content/modules";
import { newProject } from "../content/projects";
import { assemble, resolveModules } from "../engine/composition";
import { type ShaderRenderer, type Metrics } from "../engine/renderer";
import {
  db,
  saveProject,
  saveDraft,
  saveVersion,
  assetsFor,
  putAsset,
} from "../storage/repository";
import { validateAsset } from "../storage/assets";
import { exportProject } from "../storage/transfer";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import Preview from "./Preview";
import CodeEditor from "./CodeEditor";
import Parameters from "./Parameters";
import { FunctionPanel, FunctionDetails } from "./Functions";
export default function Editor() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [searchParams, setSearchParams] = useSearchParams();
  const data = useData();
  const session = useSession();
  const { project, dirty, diagnostics, compileStatus, edit } = session;
  const engine = useRef<ShaderRenderer | null>(null),
    assetsRef = useRef<AssetRecord[]>([]),
    compileSeq = useRef(0),
    initialized = useRef(""),
    lastGood = useRef<ShaderProject | null>(null),
    upload = useRef<HTMLInputElement>(null),
    initialCompile = useRef(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]),
    [selected, setSelected] = useState("fbm"),
    [stage, setStage] = useState<"vertex" | "fragment">("fragment"),
    [codeMode, setCodeMode] = useState<"body" | "assembled" | "module">("body"),
    [auto, setAuto] = useState(false),
    [metrics, setMetrics] = useState<Metrics>(),
    [activeTab, setActiveTab] = useState("preview"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [menu, setMenu] = useState(false),
    [dialog, setDialog] = useState<
      "versions" | "export" | "effects" | "metadata" | null
    >(null),
    [versions, setVersions] = useState<ProjectVersion[]>([]),
    [versionName, setVersionName] = useState(""),
    [recovery, setRecovery] = useState<Draft | null>(null),
    [recoverChecked, setRecoverChecked] = useState(false),
    [draftState, setDraftState] = useState(""),
    [sizes, setSizes] = useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem("shader-panels") ||
            '{"left":280,"right":310,"split":57}',
        );
      } catch {
        return { left: 280, right: 310, split: 57 };
      }
    });
  const compile = useCallback(async () => {
    const p = useSession.getState().project,
      e = engine.current;
    if (!p || !e) return;
    const seq = ++compileSeq.current;
    useSession.getState().setCompileStatus("Compiling");
    try {
      const build = assemble(p);
      const errors = await e.compile(build, p.uniforms, assetsRef.current);
      if (seq !== compileSeq.current) return;
      useSession.getState().setDiagnostics(errors);
      useSession
        .getState()
        .setCompileStatus(errors.length ? "Compile error" : "Compiled");
      if (!errors.length) {
        lastGood.current = structuredClone(p);
        const current = useSession.getState().project;
        if (current?.id === p.id)
          useSession.setState({
            project: {
              ...current,
              lastSuccessful: {
                vertex: build.vertex,
                fragment: build.fragment,
                uniformDefinitions: build.uniforms,
                uniforms: structuredClone(p.uniforms),
              },
            },
          });
      }
    } catch (err) {
      if (seq !== compileSeq.current) return;
      useSession.getState().setDiagnostics([
        {
          severity: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      ]);
      useSession.getState().setCompileStatus("Compile error");
    }
  }, []);
  const onReady = useCallback(
    (e: ShaderRenderer | null) => {
      engine.current = e;
      if (e) {
        const restore = async () => {
          const p = lastGood.current || useSession.getState().project;
          if (!p) return;
          try {
            if (lastGood.current)
              await e.compile(assemble(p), p.uniforms, assetsRef.current);
            else if (p.lastSuccessful)
              await e.compile(
                {
                  id: uid(),
                  vertex: p.lastSuccessful.vertex,
                  fragment: p.lastSuccessful.fragment,
                  maps: { vertex: [], fragment: [] },
                  uniforms:
                    p.lastSuccessful.uniformDefinitions || p.uniformDefinitions,
                },
                p.lastSuccessful.uniforms || p.uniforms,
                assetsRef.current,
              );
          } catch (err) {
            setError(String(err));
          }
        };
        e.setRestore(() => void restore());
        initialCompile.current = false;
        setTimeout(() => {
          if (engine.current === e) {
            void restore().then(compile);
            initialCompile.current = true;
          }
        }, 0);
      }
    },
    [compile],
  );
  useEffect(() => {
    if (data.loading) return;
    let cancelled = false;
    setRecoverChecked(false);
    setError("");
    initialCompile.current = false;
    lastGood.current = null;
    void (async () => {
      try {
        let p = await db.projects.get(id!);
        if (!p) p = data.projects.find((p) => p.id === id);
        if (!p) throw Error("This project was not found on this device.");
        if (cancelled) return;
        session.setProject(p);
        initialized.current = id!;
        const a = await assetsFor(p);
        if (cancelled) return;
        assetsRef.current = a;
        setAssets(a);
        const draft = await db.drafts.get(p.id);
        if (cancelled) return;
        if (draft && draft.updatedAt > p.updatedAt) setRecovery(draft);
        setRecoverChecked(true);
      } catch (err) {
        const p = data.projects.find((p) => p.id === id);
        if (p) {
          session.setProject(p);
          initialized.current = id!;
          setRecoverChecked(true);
        } else setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      initialized.current = "";
    };
  }, [id, data.loading]);
  useEffect(() => {
    if (!project || initialized.current !== id) return;
    let cancelled = false;
    void assetsFor(project)
      .then((a) => {
        if (!cancelled) {
          assetsRef.current = a;
          setAssets(a);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project?.assets.join(","), id]);
  useEffect(() => {
    if (
      !project ||
      !dirty ||
      !recoverChecked ||
      recovery ||
      initialized.current !== id
    )
      return;
    setDraftState("Draft pending");
    const timer = setTimeout(
      () =>
        void saveDraft(project)
          .then(() => setDraftState("Draft secured"))
          .catch(() =>
            setDraftState("Temporary session — export to keep edits"),
          ),
      1000,
    );
    return () => clearTimeout(timer);
  }, [project, dirty, recoverChecked, recovery, id]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      const state = useSession.getState();
      if (state.dirty) {
        void saveDraft(state.project!).catch(() => {});
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      const state = useSession.getState();
      if (state.dirty && state.project)
        void saveDraft(state.project).catch(() => {});
    };
  }, []);
  const structure = project
    ? JSON.stringify([
        project.vertexBody,
        project.fragmentBody,
        project.modules,
        project.customModules,
        project.effects,
        project.uniformDefinitions,
        project.uniformDefinitions
          .filter((d) => d.storage === "constant")
          .map((d) => [d.name, project.uniforms[d.name] ?? d.default]),
      ])
    : "";
  useEffect(() => {
    if (!auto || !initialCompile.current) return;
    const t = setTimeout(() => void compile(), 700);
    return () => clearTimeout(t);
  }, [structure, auto, compile]);
  useEffect(() => {
    if (project)
      void engine.current
        ?.updateUniforms(project, assetsRef.current)
        .catch((e) => setError(String(e)));
  }, [project?.uniforms, project?.uniformDefinitions, assets]);
  async function save(asNew = false) {
    const p = useSession.getState().project;
    if (!p) return;
    setSaving(true);
    try {
      const snapshot = structuredClone(p);
      if (engine.current && p.lastSuccessful)
        snapshot.thumbnail = engine.current.capture(true);
      const saved = await saveProject(asNew ? newProject(snapshot) : snapshot);
      const current = useSession.getState().project;
      if (asNew) {
        await data.refresh();
        navigate(`/editor/${saved.id}`);
      } else if (current === p) session.markSaved(saved);
      else if (current?.id === p.id)
        useSession.setState({
          project: {
            ...current,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          },
          dirty: true,
        });
      await data.refresh();
      data.notify(
        asNew ? "Saved as a new shader" : "Shader saved on this device",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void compile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [compile]);
  async function addAsset(file?: File) {
    if (!file || !project) return;
    try {
      const a = await validateAsset(file);
      await putAsset(a);
      edit((p) => {
        p.assets.push(a.id);
        if (a.kind === "model") {
          p.preview.geometry = "custom";
          p.preview.modelAsset = a.id;
        } else {
          const def = p.uniformDefinitions.find((d) => d.type === "sampler2D");
          if (def) p.uniforms[def.name] = a.id;
          else {
            p.uniformDefinitions.push({
              name: "uTexture",
              type: "sampler2D",
              group: "Textures",
              default: "",
              wrap: "repeat",
              filter: "linear",
              colorSpace: "srgb",
            });
            p.uniforms.uTexture = a.id;
          }
        }
      });
      data.notify(
        `${a.name} imported${a.kind === "texture" ? ". Sample uTexture in your shader." : "."}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function showVersions() {
    if (!project) return;
    try {
      setVersions(
        (
          await db.versions.where("projectId").equals(project.id).toArray()
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      setDialog("versions");
    } catch (e) {
      setError(String(e));
    }
  }
  function resize(which: "left" | "right" | "split", delta: number) {
    setSizes((s: typeof sizes) => {
      const next = {
        ...s,
        [which]: Math.max(
          which === "split" ? 30 : 220,
          Math.min(which === "split" ? 75 : 420, s[which] + delta),
        ),
      };
      localStorage.setItem("shader-panels", JSON.stringify(next));
      return next;
    });
  }
  function divider(which: "left" | "right" | "split") {
    return (
      <div
        role="separator"
        aria-label={`Resize ${which} panel`}
        aria-orientation={which === "split" ? "horizontal" : "vertical"}
        aria-valuenow={sizes[which]}
        aria-valuemin={which === "split" ? 30 : 220}
        aria-valuemax={which === "split" ? 75 : 420}
        tabIndex={0}
        className={`panel-divider divider-${which}`}
        onKeyDown={(e) => {
          if (
            ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            resize(
              which,
              (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) *
                (which === "split" ? 2 : 10) *
                (which === "right" ? -1 : 1),
            );
          }
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          const start = which === "split" ? e.clientY : e.clientX;
          let prev = start;
          const move = (event: PointerEvent) => {
            const current = which === "split" ? event.clientY : event.clientX;
            resize(
              which,
              ((current - prev) * (which === "right" ? -1 : 1)) /
                (which === "split" ? 6 : 1),
            );
            prev = current;
          };
          const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop);
        }}
      />
    );
  }
  if (!project || project.id !== id)
    return (
      <div className="loading-screen">
        {error ? (
          <>
            <AlertCircle />
            <p>{error}</p>
            <Button onClick={() => navigate("/")}>Back to Library</Button>
          </>
        ) : (
          <>
            <span className="spinner" />
            Opening shader…
          </>
        )}
      </div>
    );
  const selectedModule = [...modules, ...project.customModules].find(
    (m) => m.id === selected,
  );
  let build;
  try {
    build = assemble(project);
  } catch {
    /* Diagnostics shown after compile. */
  }
  const body = stage === "vertex" ? project.vertexBody : project.fragmentBody;
  const code =
    codeMode === "assembled"
      ? build?.[stage] ||
        "// Resolve composition errors to view assembled source."
      : codeMode === "module"
        ? selectedModule?.source || "// Select a function to view its source."
        : body;
  const codeDiagnostics = diagnostics.filter((d) =>
    codeMode === "body"
      ? d.source === stage
      : codeMode === "module"
        ? d.source === selected
        : d.stage === stage,
  );
  const left = (
    <FunctionPanel
      project={project}
      edit={edit}
      selected={selected}
      onSelect={setSelected}
      onCreated={(module) => {
        setSelected(module.id);
        setCodeMode("module");
        setStage(module.stages.includes("fragment") ? "fragment" : "vertex");
        setActiveTab("code");
      }}
      notify={data.notify}
    />
  );
  const right = (
    <>
      <Parameters
        project={project}
        edit={edit}
        assets={assets}
        onUpload={() => upload.current?.click()}
        notify={data.notify}
      />
      <FunctionDetails
        module={selectedModule}
        project={project}
        edit={edit}
        onEditSource={(id) => {
          setSelected(id);
          setCodeMode("module");
          setActiveTab("code");
        }}
        notify={data.notify}
      />
    </>
  );
  return (
    <div
      className="editor-page"
      style={
        {
          "--left-panel": `${sizes.left}px`,
          "--right-panel": `${sizes.right}px`,
          "--preview-split": `${sizes.split}%`,
        } as CSSProperties
      }
    >
      <div className="editor-project-bar">
        <div className="row">
          <button
            className="back-button"
            onClick={async () => {
              if (dirty) {
                try {
                  await saveDraft(project);
                } catch {
                  setError(
                    "Draft could not be saved. Export a package before leaving, or use the browser back button to discard.",
                  );
                  return;
                }
              }
              navigate("/");
            }}
          >
            <ArrowLeft size={16} />
            <span>Library</span>
          </button>
          <span className="toolbar-divider" />
          <input
            className="project-name"
            aria-label="Project name"
            maxLength={100}
            value={project.name}
            onChange={(e) =>
              edit((p) => {
                p.name = e.target.value;
              })
            }
          />
          <span className="project-type">GLSL</span>
        </div>
        <div className="row">
          <span className={`save-status ${dirty ? "unsaved" : ""}`}>
            <span />
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved locally"}
          </span>
          <Button
            size="sm"
            disabled={saving || !project.name.trim()}
            onClick={() => void save()}
          >
            <Save size={14} />
            Save
          </Button>
          <div className="menu-anchor">
            <button
              className="icon-button"
              aria-label="Project actions"
              onClick={() => setMenu(!menu)}
            >
              <ChevronDown size={16} />
            </button>
            {menu && (
              <>
                <button
                  className="menu-scrim"
                  aria-label="Close project menu"
                  onClick={() => setMenu(false)}
                />
                <div className="dropdown-menu">
                  <button
                    onClick={() => {
                      setMenu(false);
                      setDialog("metadata");
                    }}
                  >
                    <Settings2 size={15} />
                    Project Details
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      void save(true);
                    }}
                  >
                    <Copy size={15} />
                    Save As New
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      void showVersions();
                    }}
                  >
                    <History size={15} />
                    Versions
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      setDialog("export");
                    }}
                  >
                    <Download size={15} />
                    Export
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      upload.current?.click();
                    }}
                  >
                    <Upload size={15} />
                    Import Asset
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      setDialog("effects");
                    }}
                  >
                    <Layers size={15} />
                    Effect Hooks
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="editor-mobile-tabs">
        {[
          ["preview", "Preview", Play],
          ["code", "Code", Code2],
          ["functions", "Functions", Layers],
          ["parameters", "Parameters", SlidersHorizontal],
        ].map(([value, label, Icon]) => (
          <button
            key={String(value)}
            className={activeTab === value ? "selected" : ""}
            onClick={() => setActiveTab(String(value))}
          >
            <Icon size={15} />
            {String(label)}
          </button>
        ))}
      </div>
      {error && (
        <div className="editor-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            className="mini-icon"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className={`editor-workspace mobile-${activeTab}`}>
        <div className="editor-left">{left}</div>
        {divider("left")}
        <div className="editor-center">
          <div className="editor-preview-wrap">
            <Preview
              project={project}
              assets={assets}
              onReady={onReady}
              onEdit={edit}
              onUpload={() => upload.current?.click()}
              onError={setError}
              onMetrics={setMetrics}
            />
          </div>
          {divider("split")}
          <section className="code-panel panel">
            <header className="code-toolbar">
              <div className="code-stage-tabs">
                <button
                  className={stage === "fragment" ? "selected" : ""}
                  onClick={() => {
                    setStage("fragment");
                    setCodeMode("body");
                  }}
                >
                  <Code2 size={14} />
                  Fragment Shader
                </button>
                <button
                  className={stage === "vertex" ? "selected" : ""}
                  onClick={() => {
                    setStage("vertex");
                    setCodeMode("body");
                  }}
                >
                  <Plus size={13} />
                  Vertex Shader
                </button>
              </div>
              <div className="row">
                <select
                  aria-label="Source view"
                  value={codeMode}
                  onChange={(e) =>
                    setCodeMode(e.target.value as typeof codeMode)
                  }
                >
                  <option value="body">Body</option>
                  <option value="assembled">Assembled</option>
                  <option value="module">Function</option>
                </select>
                <button
                  className="mini-icon"
                  aria-label="Copy source"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(code)
                      .then(() => data.notify("Source copied"))
                      .catch(() =>
                        setError(
                          "Clipboard unavailable. Select and copy the code manually.",
                        ),
                      )
                  }
                >
                  <Copy size={15} />
                </button>
              </div>
            </header>
            {codeMode !== "body" && (
              <div className="code-mode-note">
                {codeMode === "assembled"
                  ? "Generated GLSL · read only"
                  : `${selectedModule?.name || "Function"} ${selectedModule?.builtin ? "· built-in source · use Customize to edit" : "· editable source"}`}
              </div>
            )}
            <div className="monaco-wrap">
              <CodeEditor
                path={`${project.id}/${codeMode === "module" ? selected : stage}/${codeMode}.glsl`}
                value={code}
                readOnly={
                  codeMode === "assembled" ||
                  (codeMode === "module" &&
                    (!selectedModule || !!selectedModule.builtin))
                }
                diagnostics={codeDiagnostics}
                suggestions={[
                  ...project.uniformDefinitions.map((d) => d.name),
                  ...[...modules, ...project.customModules].flatMap(
                    (m) => m.exports,
                  ),
                ]}
                onChange={(value) =>
                  edit((p) => {
                    if (codeMode === "body")
                      p[stage === "vertex" ? "vertexBody" : "fragmentBody"] =
                        value;
                    else if (codeMode === "module") {
                      const m = p.customModules.find((m) => m.id === selected);
                      if (m) {
                        m.source = value;
                        m.version = `local-${uid()}`;
                        const ref = p.modules.find((r) => r.id === m.id);
                        if (ref) ref.version = m.version;
                        for (const module of p.customModules)
                          for (const dep of module.dependencies)
                            if (dep.id === m.id) dep.version = m.version;
                      }
                    }
                  })
                }
              />
            </div>
            {diagnostics.length > 0 && (
              <div className="diagnostics" role="alert">
                <strong>
                  <AlertCircle size={14} />
                  {diagnostics.length} compilation{" "}
                  {diagnostics.length === 1 ? "error" : "errors"} · last
                  successful preview retained
                </strong>
                {diagnostics.map((d, i) => (
                  <pre key={i}>
                    {d.source ? `${d.source}:${d.line} — ` : ""}
                    {d.message}
                  </pre>
                ))}
              </div>
            )}
            <div className="code-status">
              <span>
                <span
                  className={`tiny-dot ${compileStatus === "Compile error" ? "red" : ""}`}
                />
                {compileStatus}
              </span>
              <span>
                GLSL ES 3.00 <span className="muted">· UTF-8</span>
              </span>
            </div>
          </section>
        </div>
        {divider("right")}
        <div className="editor-right">{right}</div>
      </div>
      <div className="editor-bottom-bar">
        <div className="row">
          <span className="renderer-badge">
            <span className="tiny-dot" />
            WebGL2
          </span>
          <span className="fps-counter">
            {metrics?.fps || 0}
            <small> FPS</small>
          </span>
          <select
            aria-label="Render resolution"
            value={project.preview.resolution}
            onChange={(e) =>
              edit((p) => {
                p.preview.resolution = e.target.value as "auto";
              })
            }
          >
            <option value="auto">Auto-fit</option>
            <option value="640x360">640 × 360</option>
            <option value="1280x720">1280 × 720</option>
            <option value="1920x1080">1920 × 1080</option>
          </select>
          <span
            className="metrics-detail"
            title={`CPU frame interval: ${(metrics?.frameMs || 0).toFixed(1)}ms. Geometry: ${metrics?.geometries || 0}; textures: ${metrics?.textures || 0}; programs: ${metrics?.programs || 0}`}
          >
            {metrics?.resolution} · {(metrics?.compileMs || 0).toFixed(0)}ms
            compile
          </span>
        </div>
        <div className="row">
          <label className="auto-compile">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto compile
          </label>
          <Button size="sm" onClick={() => void showVersions()}>
            <History size={14} />
            <span>Versions</span>
          </Button>
          <Button size="sm" onClick={() => setDialog("export")}>
            <Download size={14} />
            <span>Export</span>
          </Button>
          <Button
            variant="default"
            disabled={compileStatus === "Compiling"}
            onClick={() => void compile()}
          >
            <Play size={14} fill="currentColor" />
            Compile<kbd>⌘ ↵</kbd>
          </Button>
        </div>
      </div>
      <div className="editor-footnote">
        <span>
          {draftState || "Local workspace"} ·{" "}
          {project.modules.filter((m) => m.enabled).length} selected modules
        </span>
        <span>Drag to orbit · Scroll to zoom · Ctrl/⌘ + Enter to compile</span>
      </div>
      <input
        ref={upload}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,.glb"
        onChange={(e) => {
          void addAsset(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Dialog
        open={!!recovery}
        onOpenChange={() => {}}
        title="Recover your latest edits?"
        description="A recovery draft is newer than the saved project."
      >
        <div className="row">
          <Button
            variant="default"
            onClick={() => {
              session.setProject(recovery!.project);
              useSession.setState({ dirty: true });
              setRecovery(null);
              setTimeout(() => void compile(), 0);
            }}
          >
            Recover Draft
          </Button>
          <Button
            onClick={() => {
              void db.drafts.delete(project.id);
              setRecovery(null);
            }}
          >
            Use Saved Project
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={searchParams.has("guide")}
        onOpenChange={(o) => {
          if (!o) setSearchParams({});
        }}
        title="Welcome to your shader lab"
        description="A few small changes can lead somewhere unexpected."
      >
        <ol className="quick-guide">
          <li>
            <strong>Explore the surface.</strong> Drag the preview to orbit.
            Pause time to inspect a frame.
          </li>
          <li>
            <strong>Change a parameter.</strong> Try Noise Scale or a Lighting
            value. Uniform values update immediately.
          </li>
          <li>
            <strong>Make it yours.</strong> Edit the fragment body, then press
            Ctrl/Cmd+Enter to compile.
          </li>
          <li>
            <strong>Keep the experiment.</strong> Save locally, create a
            version, or export a portable package.
          </li>
        </ol>
        <Button variant="default" onClick={() => setSearchParams({})}>
          Start Exploring
        </Button>
      </Dialog>
      <Dialog
        open={dialog === "versions"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Version history"
        description="Immutable snapshots. Restoring creates an editable draft and preserves existing history."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveVersion(project, versionName.trim())
              .then((v) => {
                setVersions((vs) => [v, ...vs]);
                setVersionName("");
                data.notify("Version snapshot saved");
              })
              .catch((e) => setError(String(e)));
          }}
        >
          <div className="row">
            <input
              aria-label="Version name"
              placeholder="e.g. Softer light, warmer colors"
              required
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
            <Button type="submit" variant="default">
              <Plus size={14} />
              Save Version
            </Button>
          </div>
        </form>
        <div className="version-list">
          {!versions.length && (
            <p className="muted">
              No snapshots yet. Save a version before your next experiment.
            </p>
          )}
          {versions.map((v) => (
            <div className="version-item" key={v.id}>
              <div>
                <strong>{v.name}</strong>
                <small>{new Date(v.createdAt).toLocaleString()}</small>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const restored = {
                    ...structuredClone(v.project),
                    revision: project.revision,
                    id: project.id,
                  };
                  session.setProject(restored);
                  useSession.setState({ dirty: true });
                  setDialog(null);
                  setTimeout(() => void compile(), 0);
                  data.notify("Version restored to working draft");
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={dialog === "metadata"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Project details"
      >
        <label className="field-label">
          Name
          <input
            maxLength={100}
            value={project.name}
            onChange={(e) =>
              edit((p) => {
                p.name = e.target.value;
              })
            }
          />
        </label>
        <label className="field-label">
          Description
          <textarea
            rows={4}
            maxLength={4000}
            value={project.description}
            onChange={(e) =>
              edit((p) => {
                p.description = e.target.value;
              })
            }
          />
        </label>
        <label className="field-label">
          Category
          <select
            value={project.category}
            onChange={(e) =>
              edit((p) => {
                p.category = e.target.value as ShaderProject["category"];
              })
            }
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Tags (comma separated)
          <input
            value={project.tags.join(", ")}
            onChange={(e) =>
              edit((p) => {
                p.tags = e.target.value.split(",").map((t) => t.trim());
              })
            }
          />
        </label>
        <label className="field-label">
          Author
          <input
            value={project.author}
            onChange={(e) =>
              edit((p) => {
                p.author = e.target.value;
              })
            }
          />
        </label>
        <Button variant="default" onClick={() => setDialog(null)}>
          Done
        </Button>
      </Dialog>
      <Dialog
        open={dialog === "export"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Export shader"
        description="Take your experiment with you. Packages include all editable state and assets."
      >
        <div className="export-options">
          {(
            [
              [
                "zip",
                "Project package",
                ".shaderlab.zip · full editable project",
                Download,
              ],
              ["json", "Project JSON", "Asset-free projects only", FileCode2],
              [
                "glsl",
                "GLSL source bundle",
                "Assembled programs + runtime contract",
                Code2,
              ],
            ] as const
          ).map(([format, title, description, Icon]) => (
            <button
              key={format}
              onClick={() =>
                void exportProject(project, assets, format)
                  .then(() => data.notify("Export downloaded"))
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : String(e)),
                  )
              }
            >
              <Icon size={22} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <Download size={16} />
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        wide
        open={dialog === "effects"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Composition effect hooks"
        description="Explicit code adapters run at a fixed hook stage. Changes take effect after compilation."
      >
        <div className="effect-list">
          {project.effects.map((effect, i) => (
            <div className="effect-editor" key={effect.id}>
              <div className="row spread">
                <input
                  aria-label="Effect name"
                  value={effect.name}
                  onChange={(e) =>
                    edit((p) => {
                      p.effects[i].name = e.target.value;
                    })
                  }
                />
                <label className="row">
                  <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={(e) =>
                      edit((p) => {
                        p.effects[i].enabled = e.target.checked;
                      })
                    }
                  />
                  Enabled
                </label>
                <button
                  className="mini-icon"
                  aria-label={`Delete effect ${effect.name}`}
                  onClick={() =>
                    edit((p) => {
                      p.effects.splice(i, 1);
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="row">
                <select
                  aria-label="Hook stage"
                  value={effect.stage}
                  onChange={(e) =>
                    edit((p) => {
                      p.effects[i].stage = e.target
                        .value as typeof effect.stage;
                    })
                  }
                >
                  {[
                    "uv",
                    "displacement",
                    "baseColor",
                    "lighting",
                    "finalColor",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  aria-label="Effect order"
                  type="number"
                  value={effect.order}
                  onChange={(e) =>
                    edit((p) => {
                      p.effects[i].order = Number(e.target.value);
                    })
                  }
                />
                <select
                  aria-label="Required module"
                  value={effect.moduleId}
                  onChange={(e) =>
                    edit((p) => {
                      p.effects[i].moduleId = e.target.value;
                    })
                  }
                >
                  <option value="">No module dependency</option>
                  {project.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                aria-label={`${effect.name} code`}
                className="source-textarea"
                rows={3}
                value={effect.code}
                onChange={(e) =>
                  edit((p) => {
                    p.effects[i].code = e.target.value;
                  })
                }
              />
            </div>
          ))}
        </div>
        <Button
          onClick={() =>
            edit((p) => {
              p.effects.push({
                id: uid(),
                name: "Custom effect",
                enabled: false,
                stage: "finalColor",
                order: p.effects.length,
                moduleId: "",
                code: "color *= vec3(1.0, 0.8, 1.0);",
              });
            })
          }
        >
          <Plus size={15} />
          Add Hook
        </Button>
      </Dialog>
    </div>
  );
}
