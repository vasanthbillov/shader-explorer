import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { useData } from "../app/context";
import { db } from "../storage/repository";
import { uid } from "../shared/types";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
export default function Collections() {
  const { collections, refresh, notify } = useData();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [remove, setRemove] = useState<string | null>(null);
  async function create() {
    try {
      await db.collections.put({
        id: uid(),
        name: name.trim(),
        projectIds: [],
      });
      await refresh();
      setOpen(false);
      setName("");
    } catch (e) {
      notify(String(e));
    }
  }
  return (
    <div className="content-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CREATIVE WORKSPACE</div>
          <h1>Collections</h1>
          <p>
            Keep experiments, materials, and moments of inspiration together.
          </p>
        </div>
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus size={17} />
          New Collection
        </Button>
      </div>
      <div className="collection-grid">
        {collections.map((c) => (
          <article className="collection-card" key={c.id}>
            <Bookmark size={32} />
            <Link to={`/?collection=${c.id}`}>
              <h2>{c.name}</h2>
              <p>{c.projectIds.length} shaders</p>
            </Link>
            <button
              className="icon-button"
              aria-label={`Delete collection ${c.name}`}
              onClick={() => setRemove(c.id)}
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
      {!collections.length && (
        <div className="empty-state">
          <Bookmark size={40} />
          <h2>A place for your ideas</h2>
          <p>Create a collection, then add shaders from the library.</p>
          <Button onClick={() => setOpen(true)}>Create Collection</Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="New collection">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field-label">
            Collection name
            <input
              required
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" variant="default">
            Create Collection
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Delete collection?"
      >
        <p>The shaders in this collection will remain in your library.</p>
        <Button
          variant="danger"
          onClick={() =>
            void db.collections
              .delete(remove!)
              .then(refresh)
              .then(() => setRemove(null))
              .catch((e) => notify(String(e)))
          }
        >
          Delete Collection
        </Button>
      </Dialog>
    </div>
  );
}
