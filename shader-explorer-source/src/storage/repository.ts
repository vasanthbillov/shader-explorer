import Dexie, { type Table } from "dexie";
import {
  type ShaderProject,
  type ShaderModuleVersion,
  type AssetRecord,
  type ProjectVersion,
  type Collection,
  type LibraryPreference,
  type Draft,
  projectSchema,
  now,
  uid,
} from "../shared/types";
// Binary records avoid WebKit's unreliable IndexedDB Blob persistence.
export type StoredAssetRecord = Omit<AssetRecord, "blob"> & {
  bytes?: ArrayBuffer;
  blob?: Blob;
};
export class ShaderDatabase extends Dexie {
  projects!: Table<ShaderProject, string>;
  modules!: Table<ShaderModuleVersion, [string, string]>;
  assets!: Table<StoredAssetRecord, string>;
  versions!: Table<ProjectVersion, string>;
  drafts!: Table<Draft, string>;
  collections!: Table<Collection, string>;
  preferences!: Table<LibraryPreference, string>;
  settings!: Table<{ id: string; value: unknown }, string>;
  constructor(name = "shader-explorer") {
    super(name);
    this.version(1).stores({
      projects: "id,updatedAt,category",
      modules: "[id+version],id",
      assets: "id,hash,kind",
      versions: "id,projectId,createdAt",
      drafts: "id,updatedAt",
      collections: "id,name",
      preferences: "id,lastOpened",
      settings: "id",
    });
    // Existing version-one Blob records remain readable and retain their IDs.
    this.version(2).stores({ assets: "id,hash,kind" });
  }
}
export const db = new ShaderDatabase();
export async function saveProject(project: ShaderProject) {
  project = projectSchema.parse({
    ...project,
    name: project.name.trim(),
    tags: project.tags.map((t) => t.trim()).filter(Boolean),
  });
  const next = {
    ...structuredClone(project),
    builtin: false,
    updatedAt: now(),
    revision: project.revision + 1,
  };
  await db.transaction("rw", db.projects, db.modules, db.drafts, async () => {
    const current = await db.projects.get(project.id);
    if (current && current.revision !== project.revision)
      throw Error(
        "This project was changed in another tab. Save As New to preserve your edits.",
      );
    await db.projects.put(next);
    await db.modules.bulkPut(next.customModules);
    await db.drafts.delete(project.id);
  });
  return next;
}
export async function saveDraft(project: ShaderProject) {
  await db.drafts.put({
    id: project.id,
    project: structuredClone(project),
    updatedAt: now(),
  });
}
export async function saveVersion(project: ShaderProject, name: string) {
  const version = {
    id: uid(),
    projectId: project.id,
    name: name || "Untitled version",
    createdAt: now(),
    project: structuredClone(project),
  };
  await db.versions.put(version);
  return version;
}
export async function deleteProject(id: string) {
  await db.transaction(
    "rw",
    [
      db.projects,
      db.versions,
      db.drafts,
      db.collections,
      db.preferences,
      db.assets,
    ],
    async () => {
      await db.projects.delete(id);
      await db.versions.where("projectId").equals(id).delete();
      await db.drafts.delete(id);
      await db.preferences.delete(id);
      for (const c of await db.collections.toArray())
        if (c.projectIds.includes(id))
          await db.collections.put({
            ...c,
            projectIds: c.projectIds.filter((p) => p !== id),
          });
      const refs = new Set(
        [
          ...(await db.projects.toArray()),
          ...(await db.versions.toArray()).map((v) => v.project),
          ...(await db.drafts.toArray()).map((d) => d.project),
        ].flatMap((p) => p.assets),
      );
      for (const asset of await db.assets.toArray())
        if (!refs.has(asset.id)) await db.assets.delete(asset.id);
    },
  );
}
export async function assetsFor(project: ShaderProject) {
  return (await db.assets.bulkGet(project.assets))
    .filter((a): a is StoredAssetRecord => !!a)
    .map(({ bytes, blob, ...metadata }) => ({
      ...metadata,
      blob: bytes ? new Blob([bytes], { type: metadata.mime }) : blob!,
    }));
}
export async function serializeAssets(
  assets: AssetRecord[],
): Promise<StoredAssetRecord[]> {
  return Promise.all(
    assets.map(async ({ blob, ...metadata }) => ({
      ...metadata,
      bytes: await blob.arrayBuffer(),
    })),
  );
}
export async function putAsset(asset: AssetRecord) {
  await db.assets.put((await serializeAssets([asset]))[0]);
}
