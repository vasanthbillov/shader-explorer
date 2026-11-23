import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Play,
  Search,
  Grid2X2,
  List,
  Heart,
  Clock,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Copy,
  Trash2,
  Bookmark,
  FolderPlus,
  Upload,
  Box,
  Sparkles,
  Waves,
  Mountain,
  Snowflake,
  FlaskConical,
  Palette,
  ScanLine,
  Layers,
  ExternalLink,
  X,
} from "lucide-react";
import { useData } from "../app/context";
import { examples, newProject } from "../content/projects";
import { categories, type ShaderProject, uid } from "../shared/types";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import {
  db,
  saveProject,
  deleteProject,
  assetsFor,
} from "../storage/repository";
import { exportProject, importProject } from "../storage/transfer";
const categoryIcons = [
  Box,
  Sparkles,
  Waves,
  ScanLine,
  Mountain,
  Palette,
  Layers,
  FlaskConical,
];
export default function Library({ mine = false }: { mine?: boolean }) {
  const {
    projects,
    collections,
    preferences,
    loading,
    refresh,
    notify,
    openProject,
    createProject,
    favorites,
  } = useData();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState("example-0"),
    [detailOpen, setDetailOpen] = useState(false),
    [dialog, setDialog] = useState<"rename" | "delete" | "collection" | null>(
      null,
    ),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width:1199px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:1199px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !target.closest("input,textarea,[contenteditable=true]")
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const tab = mine ? "mine" : params.get("tab") || "all",
    q = params.get("q") || "",
    category = params.get("category") || "All",
    tags = (params.get("tags") || "").split(",").filter(Boolean),
    sort = params.get("sort") || "updated",
    view = params.get("view") || "grid";
  const page = Math.max(1, Number(params.get("page")) || 1),
    collection = params.get("collection");
  const all = useMemo(() => [...examples, ...projects], [projects]);
  const favoriteIds = new Set(
    preferences.filter((p) => p.favorite).map((p) => p.id),
  );
  const recent = new Map(preferences.map((p) => [p.id, p.lastOpened || ""]));
  const selected = all.find((p) => p.id === selectedId) || all[0];
  const filtered = all
    .filter(
      (p) =>
        (tab !== "mine" || !p.builtin) &&
        (tab !== "favorites" || favoriteIds.has(p.id)) &&
        (tab !== "recent" || recent.has(p.id)) &&
        (category === "All" || p.category === category) &&
        (!collection ||
          collections
            .find((c) => c.id === collection)
            ?.projectIds.includes(p.id)) &&
        tags.every((t) => p.tags.includes(t)) &&
        `${p.name} ${p.description} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "recent"
          ? (recent.get(b.id) || "").localeCompare(recent.get(a.id) || "")
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const allTags = [
    "Fresnel",
    "Noise",
    "Iridescent",
    "Water",
    "Fire",
    "Glow",
    "Toon",
    "Grid",
    "Smoke",
  ];
  function filter(key: string, value: string) {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    if (key !== "page") p.delete("page");
    setParams(p, { replace: true });
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function doImport(file?: File) {
    if (!file) return;
    await action(async () => {
      const p = await importProject(file);
      setSelectedId(p.id);
      notify(`Imported ${p.name}`);
    });
  }
  async function duplicate() {
    await action(async () => {
      const p = await saveProject(newProject(selected));
      setSelectedId(p.id);
      notify("Independent copy added to My Shaders");
    });
  }
  function showDetails(p: ShaderProject) {
    setSelectedId(p.id);
    setDetailOpen(true);
  }
  const details = (
    <>
      <div className="detail-art">
        <img
          src={selected.thumbnail || examples[0].thumbnail}
          alt={`${selected.name} preview`}
        />
        <span className="preview-chip">
          <Play size={10} fill="currentColor" /> PREVIEW
        </span>
      </div>
      <div className="detail-content">
        <div className="detail-name">
          <h2>{selected.name}</h2>
          <button
            className={`icon-button ${favoriteIds.has(selected.id) ? "favorited" : ""}`}
            onClick={() => void favorites(selected.id)}
            aria-label={
              favoriteIds.has(selected.id)
                ? "Remove favorite"
                : "Favorite shader"
            }
          >
            <Heart
              size={19}
              fill={favoriteIds.has(selected.id) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="tag-list">
          {selected.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
        <p className="detail-description">{selected.description}</p>
        <dl className="detail-meta">
          <div>
            <dt>Author</dt>
            <dd>{selected.author}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{selected.category}</dd>
          </div>
          <div>
            <dt>Modified</dt>
            <dd>
              {new Date(selected.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt>Functions</dt>
            <dd>
              {selected.modules.filter((m) => m.enabled).length} active modules
            </dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{selected.builtin ? "Built-in example" : "On this device"}</dd>
          </div>
        </dl>
        <div className="detail-actions">
          <Button variant="default" onClick={() => void openProject(selected)}>
            <Code2 size={16} />
            Open in Editor
          </Button>
          <Button disabled={busy} onClick={() => void duplicate()}>
            <Copy size={15} />
            {selected.builtin ? "Save to My Shaders" : "Duplicate Shader"}
          </Button>
          <Button
            onClick={() =>
              void action(async () =>
                exportProject(selected, await assetsFor(selected)),
              )
            }
          >
            <Download size={15} />
            Export Package
          </Button>
          <Button onClick={() => setDialog("collection")}>
            <Bookmark size={15} />
            Add to Collection
          </Button>
          {!selected.builtin && (
            <div className="row">
              <Button
                size="sm"
                onClick={() => {
                  setName(selected.name);
                  setDialog("rename");
                }}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={14} />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
  return (
    <div className="library-page">
      <section className="library-hero">
        <div className="hero-grid" />
        <div className="hero-copy">
          <div className="eyebrow">
            <span />
            YOUR NEXT GREAT EFFECT STARTS HERE
          </div>
          <h1>
            Small code.
            <br />
            <span>Infinite possibilities.</span>
          </h1>
          <p>
            Explore a world of real-time shaders.
            <br />
            Break things. Bend light. Make something yours.
          </p>
          <div className="row">
            <Button variant="default" onClick={() => void createProject()}>
              <Plus size={19} />
              Create New Shader
            </Button>
            <Button onClick={() => void openProject(examples[0], true)}>
              <Play size={15} fill="currentColor" />
              Quick Start
            </Button>
          </div>
          <div className="hero-footnote">
            <span>GLSL ES 3.00</span>
            <i />
            <span>WebGL2 powered</span>
            <i />
            <span>Built for exploration</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orb-halo" />
          <img src={`${import.meta.env.BASE_URL}hero.svg`} alt="" />
          <div className="hero-art-caption">
            <span className="tiny-dot" />
            IRIDESCENT FLOW <span>01 / LIVE POSSIBILITIES</span>
          </div>
        </div>
      </section>
      <section className="library-workspace">
        <div className="library-toolbar">
          <div className="library-tabs">
            {[
              ["all", "All Shaders", all.length],
              ["mine", "My Shaders", projects.length],
              ["favorites", "Favorites", favoriteIds.size],
              [
                "recent",
                "Recently Used",
                preferences.filter((p) => p.lastOpened).length,
              ],
            ].map(([id, label, count]) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => {
                  if (mine && id !== "mine") location.hash = `/?tab=${id}`;
                  else filter("tab", String(id));
                }}
              >
                {id === "favorites" && <Heart size={14} />}
                <span>{label}</span>
                {id !== "recent" && <small>{count}</small>}
              </button>
            ))}
          </div>
          <div className="library-tools">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              Import
            </Button>
            <div className="view-switch">
              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => filter("view", "grid")}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => filter("view", "list")}
              >
                <List size={17} />
              </button>
            </div>
            <select
              aria-label="Sort shaders"
              value={sort}
              onChange={(e) => filter("sort", e.target.value)}
            >
              <option value="updated">Sort: Updated</option>
              <option value="name">Sort: Name</option>
              <option value="recent">Sort: Recently Opened</option>
            </select>
          </div>
        </div>
        <div className="library-body">
          <aside className="library-sidebar">
            <div className="sidebar-section">
              <h2>
                Categories <ChevronDown size={14} />
              </h2>
              <button
                className={`category-item ${category === "All" ? "selected" : ""}`}
                onClick={() => filter("category", "All")}
              >
                <Grid2X2 size={15} />
                <span>All Shaders</span>
                <small>{all.length}</small>
              </button>
              {categories.map((c, i) => {
                const Icon = categoryIcons[i];
                return (
                  <button
                    key={c}
                    className={`category-item ${category === c ? "selected" : ""}`}
                    onClick={() => filter("category", c)}
                  >
                    <Icon size={15} />
                    <span>{c}</span>
                    <small>{all.filter((p) => p.category === c).length}</small>
                  </button>
                );
              })}
            </div>
            <div className="sidebar-section tags-section">
              <h2>
                Popular tags <ChevronDown size={14} />
              </h2>
              <div className="tag-list">
                {allTags.map((t) => (
                  <button
                    key={t}
                    className={`tag ${tags.includes(t) ? "active" : ""}`}
                    onClick={() =>
                      filter(
                        "tags",
                        (tags.includes(t)
                          ? tags.filter((x) => x !== t)
                          : [...tags, t]
                        ).join(","),
                      )
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-note">
              <div className="sidebar-note-icon">
                <Sparkles size={20} />
              </div>
              <strong>
                A little curiosity.
                <br />A lot of possibility.
              </strong>
              <p>Pick a shader, change a value, and see where it takes you.</p>
              <button onClick={() => void openProject(examples[0], true)}>
                Take a quick tour <ExternalLink size={12} />
              </button>
            </div>
          </aside>
          <div className="gallery-main">
            <div className="search-row">
              <label className="search-field">
                <Search size={17} />
                <input
                  ref={searchInput}
                  aria-label="Search shaders"
                  placeholder="Search shaders, effects, tags…"
                  value={q}
                  onChange={(e) => filter("q", e.target.value)}
                />
                {q && (
                  <button
                    aria-label="Clear search"
                    onClick={() => filter("q", "")}
                  >
                    <X size={15} />
                  </button>
                )}
                <kbd>/</kbd>
              </label>
              <span className="result-count">{filtered.length} shaders</span>
            </div>
            <div className="mobile-tag-filters">
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`tag ${tags.includes(t) ? "active" : ""}`}
                  onClick={() =>
                    filter(
                      "tags",
                      (tags.includes(t)
                        ? tags.filter((x) => x !== t)
                        : [...tags, t]
                      ).join(","),
                    )
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            {collection && (
              <div className="collection-filter">
                Collection: {collections.find((c) => c.id === collection)?.name}
                <button onClick={() => filter("collection", "")}>Clear</button>
              </div>
            )}
            {loading ? (
              <div className="empty-state">
                <span className="spinner" />
                Loading your library…
              </div>
            ) : !visible.length ? (
              <div className="empty-state">
                <Search size={32} />
                <h2>No shaders here yet</h2>
                <p>Try different filters or create something new.</p>
                <Button onClick={() => setParams({})}>Clear filters</Button>
              </div>
            ) : (
              <div
                className={`shader-grid ${view === "list" ? "list-view" : ""}`}
              >
                {visible.map((p) => (
                  <article
                    key={p.id}
                    className={`shader-card ${selected.id === p.id ? "selected" : ""}`}
                  >
                    <button
                      className="card-preview"
                      onClick={() => showDetails(p)}
                      aria-label={`Select ${p.name}`}
                    >
                      <img
                        src={p.thumbnail || examples[0].thumbnail}
                        alt=""
                        loading="lazy"
                      />
                      <span className="card-open">
                        <Code2 size={15} />
                        Inspect shader
                      </span>
                      {p.id === "example-0" && (
                        <span className="featured-label">
                          <Sparkles size={10} />
                          FEATURED
                        </span>
                      )}
                    </button>
                    <button
                      className={`card-favorite ${favoriteIds.has(p.id) ? "favorited" : ""}`}
                      aria-label={`${favoriteIds.has(p.id) ? "Unfavorite" : "Favorite"} ${p.name}`}
                      onClick={() => void favorites(p.id)}
                    >
                      <Heart
                        size={16}
                        fill={favoriteIds.has(p.id) ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="card-text"
                      onClick={() => showDetails(p)}
                    >
                      <h3>{p.name}</h3>
                      <p>{p.tags.slice(0, 3).join(" · ")}</p>
                    </button>
                    <div className="card-footer">
                      <span>
                        <span
                          className={`category-dot dot-${categories.indexOf(p.category)}`}
                        />
                        {p.category}
                      </span>
                      <button
                        aria-label={`Open ${p.name} in editor`}
                        onClick={() => void openProject(p)}
                      >
                        <Code2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="gallery-bottom">
              <span>
                Showing {filtered.length ? (currentPage - 1) * 12 + 1 : 0}–
                {Math.min(currentPage * 12, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="pagination">
                <button
                  aria-label="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => filter("page", String(currentPage - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    className={currentPage === i + 1 ? "selected" : ""}
                    onClick={() => filter("page", String(i + 1))}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  aria-label="Next page"
                  disabled={currentPage === pages}
                  onClick={() => filter("page", String(currentPage + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
          <aside className="shader-details">{details}</aside>
        </div>
      </section>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.json"
        hidden
        onChange={(e) => {
          void doImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Dialog
        open={detailOpen && narrow}
        onOpenChange={setDetailOpen}
        title="Shader details"
      >
        <div className="mobile-details">{details}</div>
      </Dialog>
      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog === "delete"
            ? "Delete shader?"
            : dialog === "rename"
              ? "Rename shader"
              : "Add to collection"
        }
      >
        {dialog === "delete" ? (
          <>
            <p>
              This deletes “{selected.name}”, its versions, and collection
              memberships from this browser.
            </p>
            <Button
              variant="danger"
              onClick={() =>
                void action(async () => {
                  await deleteProject(selected.id);
                  setDialog(null);
                  setSelectedId("example-0");
                  notify("Shader deleted");
                })
              }
            >
              Delete Shader
            </Button>
          </>
        ) : dialog === "rename" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await saveProject({ ...selected, name: name.trim() });
                setDialog(null);
              });
            }}
          >
            <label className="field-label">
              Name
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Button type="submit" variant="default">
              Save Name
            </Button>
          </form>
        ) : (
          <>
            <div className="collection-choices">
              {collections.map((c) => (
                <Button
                  key={c.id}
                  onClick={() =>
                    void action(async () => {
                      await db.collections.put({
                        ...c,
                        projectIds: [
                          ...new Set([...c.projectIds, selected.id]),
                        ],
                      });
                      setDialog(null);
                      notify(`Added to ${c.name}`);
                    })
                  }
                >
                  <Bookmark size={15} />
                  {c.name}
                </Button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await db.collections.put({
                    id: uid(),
                    name: name.trim(),
                    projectIds: [selected.id],
                  });
                  setName("");
                  setDialog(null);
                  notify("Collection created");
                });
              }}
            >
              <label className="field-label">
                New collection
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Material studies"
                />
              </label>
              <Button type="submit" variant="default">
                <FolderPlus size={15} />
                Create & Add
              </Button>
            </form>
          </>
        )}
      </Dialog>
    </div>
  );
}
