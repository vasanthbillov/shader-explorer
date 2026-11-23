import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import {
  db,
  saveProject,
  saveDraft,
  saveVersion,
  deleteProject,
} from "../src/storage/repository";
import { newProject } from "../src/content/projects";
beforeEach(async () => {
  await db.delete();
  await db.open();
});
describe("transactional project repository", () => {
  it("round-trips complete editing state", async () => {
    const p = newProject();
    p.uniforms.uScale = 7;
    p.preview.playing = false;
    const saved = await saveProject(p);
    expect(saved.revision).toBe(1);
    expect(await db.projects.get(p.id)).toEqual(saved);
  });
  it("rejects stale saves without overwriting newer work", async () => {
    const p = await saveProject(newProject());
    await saveProject({ ...p, name: "Newer" });
    await expect(saveProject({ ...p, name: "Stale" })).rejects.toThrow(
      "another tab",
    );
    expect((await db.projects.get(p.id))?.name).toBe("Newer");
  });
  it("clears recovery drafts only after successful save", async () => {
    const p = await saveProject(newProject());
    await saveDraft({ ...p, name: "Draft" });
    await saveProject({ ...p, name: "Saved" });
    expect(await db.drafts.get(p.id)).toBeUndefined();
  });
  it("keeps a draft after failed revision checks", async () => {
    const p = await saveProject(newProject());
    await saveProject({ ...p, name: "Newer" });
    await saveDraft(p);
    await expect(saveProject(p)).rejects.toThrow();
    expect(await db.drafts.get(p.id)).toBeDefined();
  });
  it("version snapshots remain immutable", async () => {
    const p = await saveProject(newProject());
    const v = await saveVersion(p, "Before");
    p.uniforms.uScale = 9;
    expect((await db.versions.get(v.id))?.project.uniforms.uScale).toBe(4);
  });
  it("retains assets referenced by versions and other projects", async () => {
    const p = newProject();
    p.assets = ["shared"];
    await db.assets.put({
      id: "shared",
      hash: "x",
      kind: "texture",
      name: "a.png",
      mime: "image/png",
      blob: new Blob(),
    });
    await saveProject(p);
    const other = await saveProject({ ...newProject(), assets: ["shared"] });
    await deleteProject(p.id);
    expect(await db.assets.get("shared")).toBeDefined();
    await saveVersion(other, "Keep");
    await db.projects.delete(other.id);
    await deleteProject("missing");
    expect(await db.assets.get("shared")).toBeDefined();
  });
  it("removes memberships, history, and orphaned assets on deletion", async () => {
    const p = await saveProject(newProject());
    await saveVersion(p, "Version");
    await saveDraft(p);
    await db.collections.put({ id: "c", name: "C", projectIds: [p.id] });
    await db.assets.put({
      id: "unused",
      hash: "x",
      kind: "texture",
      name: "a",
      mime: "",
      blob: new Blob(),
    });
    await deleteProject(p.id);
    expect(await db.projects.get(p.id)).toBeUndefined();
    expect(await db.versions.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect((await db.collections.get("c"))?.projectIds).toEqual([]);
    expect(await db.assets.count()).toBe(0);
  });
});

it("persists binary assets and reconstructs Blobs without losing bytes", async () => {
  const { putAsset, assetsFor } = await import("../src/storage/repository");
  const p = newProject();
  p.assets = ["binary"];
  await putAsset({
    id: "binary",
    hash: "hash",
    kind: "texture",
    name: "pixel.png",
    mime: "image/png",
    blob: new Blob([new Uint8Array([1, 2, 3])]),
  });
  const stored = await db.assets.get("binary");
  expect(stored?.bytes).toBeInstanceOf(ArrayBuffer);
  expect(stored?.blob).toBeUndefined();
  const result = await assetsFor(p);
  expect([...new Uint8Array(await result[0].blob.arrayBuffer())]).toEqual([
    1, 2, 3,
  ]);
});
it("rejects blank project names without corrupting saved data", async () => {
  const p = await saveProject(newProject());
  await expect(saveProject({ ...p, name: "   " })).rejects.toThrow();
  expect((await db.projects.get(p.id))?.name).toBe(p.name);
});
