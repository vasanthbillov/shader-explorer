import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import {
  projectSchema,
  moduleSchema,
  type ShaderProject,
  type AssetRecord,
  uid,
  now,
} from "../shared/types";
import { modules } from "../content/modules";
import { resolveModules, assemble } from "../engine/composition";
import { db, serializeAssets } from "./repository";
import { validateAsset } from "./assets";
export function download(data: Blob | string, name: string) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (typeof data !== "string")
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function collectPinned(project: ShaderProject) {
  const registry = new Map(
    [...modules, ...project.customModules].map((m) => [
      `${m.id}@${m.version}`,
      m,
    ]),
  );
  const result = new Map<string, (typeof modules)[number]>();
  const visit = (ref: { id: string; version: string }) => {
    const key = `${ref.id}@${ref.version}`;
    if (result.has(key)) return;
    const m = registry.get(key);
    if (!m) throw Error(`Missing pinned module ${key}`);
    result.set(key, m);
    m.dependencies.forEach(visit);
  };
  project.modules.forEach(visit);
  project.customModules.forEach(visit);
  return [...result.values()];
}
const safe = (s: string) =>
  s.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "shader";
export async function exportProject(
  project: ShaderProject,
  assets: AssetRecord[],
  format: "zip" | "json" | "glsl" = "zip",
) {
  const p = structuredClone(project);
  p.customModules = collectPinned(project);
  p.builtin = false;
  let build;
  try {
    build = assemble(project);
  } catch {
    /* Invalid editable projects remain portable. */
  }
  if (format === "json") {
    if (p.assets.length)
      throw Error("This project has assets. Export a package to include them.");
    download(
      new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
      `${safe(p.name)}.shaderlab.json`,
    );
    return;
  }
  const files: Record<string, Uint8Array> = {};
  if (format === "zip") {
    files["project.json"] = strToU8(JSON.stringify(p, null, 2));
    const manifest = {
      format: "shaderlab",
      schemaVersion: 1,
      assets: [] as { id: string; path: string; name: string; kind: string }[],
    };
    for (const id of p.assets) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) throw Error(`Missing asset ${id}`);
      const path = `assets/${asset.id}.${asset.kind === "model" ? "glb" : asset.name.split(".").pop()?.toLowerCase() || "png"}`;
      files[path] = new Uint8Array(await asset.blob.arrayBuffer());
      manifest.assets.push({ id, path, name: asset.name, kind: asset.kind });
    }
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  }
  if (build) {
    files["source/vertex.glsl"] = strToU8(build.vertex);
    files["source/fragment.glsl"] = strToU8(build.fragment);
    files["source/uniforms.json"] = strToU8(
      JSON.stringify(
        { definitions: build.uniforms, values: p.uniforms },
        null,
        2,
      ),
    );
  } else if (format === "glsl")
    throw Error(
      "Resolve composition errors before exporting assembled source.",
    );
  files["README.txt"] = strToU8(
    `Shader Explorer — ${p.name}\nGLSL ES 3.00 / WebGL2\nAttributes: position vec3, normal vec3, uv vec2.\nMatrices: modelMatrix, modelViewMatrix, projectionMatrix.\nEngine uniforms: uTime (seconds), uDelta, uResolution (pixels), uPointer (normalized), cameraPosition.\nVertex outputs: vUv, vWorldPosition, vWorldNormal. Fragment output: fragColor.\nSee source/uniforms.json for defaults. Texture assets must be bound by the host.\nThese shaders need adaptation for other engines, including Unity. Preview bloom is a separate postprocessing pass; enable equivalent bloom in the destination renderer when desired.\nAuthor: ${p.author}\nModules: ${p.customModules.map((m) => `${m.name} ${m.version} — ${m.author} (${m.license})`).join("; ")}\n`,
  );
  download(
    new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], {
      type: "application/zip",
    }),
    `${safe(p.name)}.${format === "glsl" ? "glsl" : "shaderlab"}.zip`,
  );
}
const manifestSchema = z.object({
  format: z.literal("shaderlab"),
  schemaVersion: z.literal(1),
  assets: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      name: z.string(),
      kind: z.enum(["model", "texture"]),
    }),
  ),
});
export async function parsePackage(
  file: File,
): Promise<{ project: ShaderProject; assets: AssetRecord[] }> {
  if (file.size > 100 * 1024 * 1024) throw Error("Package exceeds 100MB.");
  let project: ShaderProject;
  const assets: AssetRecord[] = [];
  if (file.name.endsWith(".json")) {
    project = projectSchema.parse(JSON.parse(await file.text()));
    if (project.assets.length)
      throw Error("JSON imports cannot reference external assets.");
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let count = 0,
      total = 0;
    const files = unzipSync(bytes, {
      filter: (entry) => {
        count++;
        total += entry.originalSize;
        if (count > 100 || total > 200 * 1024 * 1024)
          throw Error("Package exceeds entry or expanded-size limits.");
        if (
          entry.name.startsWith("/") ||
          entry.name.includes("\\") ||
          entry.name.split("/").includes("..")
        )
          throw Error("Unsafe package path.");
        return true;
      },
    });
    if (!files["manifest.json"] || !files["project.json"])
      throw Error("Missing package manifest or project.");
    const manifest = manifestSchema.parse(
      JSON.parse(strFromU8(files["manifest.json"])),
    );
    project = projectSchema.parse(JSON.parse(strFromU8(files["project.json"])));
    const ids = new Set<string>();
    for (const entry of manifest.assets) {
      if (ids.has(entry.id) || !files[entry.path])
        throw Error("Missing or duplicate packaged asset.");
      ids.add(entry.id);
      const data = files[entry.path];
      const asset = await validateAsset(
        new File([data as Uint8Array<ArrayBuffer>], entry.name),
      );
      if (asset.kind !== entry.kind) throw Error("Asset type mismatch.");
      assets.push({ ...asset, id: entry.id });
    }
    if (
      project.assets.some((id) => !ids.has(id)) ||
      ids.size !== project.assets.length
    )
      throw Error("Inconsistent asset references.");
  }
  if (
    project.thumbnail &&
    !/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(
      project.thumbnail,
    )
  )
    delete project.thumbnail;
  project.customModules.forEach((m) => moduleSchema.parse(m));
  collectPinned(project);
  resolveModules(project, modules);
  // Preserve module-declared controls when importing independently authored modules.
  const build = assemble(project);
  for (const definition of build.uniforms)
    if (!project.uniformDefinitions.some((d) => d.name === definition.name)) {
      project.uniformDefinitions.push(structuredClone(definition));
      project.uniforms[definition.name] ??= structuredClone(definition.default);
    }
  const map = rebindAssets(project, assets);
  return {
    project: {
      ...project,
      id: uid(),
      builtin: false,
      revision: 0,
      createdAt: now(),
      updatedAt: now(),
    },
    assets: assets.map((a) => ({ ...a, id: map.get(a.id)! })),
  };
}
export function rebindAssets(project: ShaderProject, assets: AssetRecord[]) {
  const map = new Map(assets.map((a) => [a.id, uid()]));
  const requireAsset = (id: string, kind: AssetRecord["kind"]) => {
    if (!assets.some((a) => a.id === id && a.kind === kind))
      throw Error(`Missing ${kind} asset ${id}`);
    return map.get(id)!;
  };
  if (project.preview.modelAsset)
    project.preview.modelAsset = requireAsset(
      project.preview.modelAsset,
      "model",
    );
  else if (project.preview.geometry === "custom")
    throw Error("Custom preview needs a model asset.");
  const definitions = [
    ...project.uniformDefinitions,
    ...project.customModules.flatMap((m) => m.uniforms),
    ...(project.lastSuccessful?.uniformDefinitions || []),
  ].filter((d) => d.type === "sampler2D");
  for (const name of new Set(definitions.map((d) => d.name)))
    for (const values of [
      project.uniforms,
      ...project.presets.map((p) => p.values),
      ...(project.lastSuccessful?.uniforms
        ? [project.lastSuccessful.uniforms]
        : []),
    ]) {
      const value = values[name];
      if (value) values[name] = requireAsset(String(value), "texture");
    }
  for (const definition of new Set(definitions))
    if (definition.default)
      definition.default = requireAsset(String(definition.default), "texture");
  project.assets = project.assets.map((id) => {
    if (!map.has(id)) throw Error(`Missing asset ${id}`);
    return map.get(id)!;
  });
  return map;
}
export async function importProject(file: File) {
  const result = await parsePackage(file);
  const storedAssets = await serializeAssets(result.assets);
  await db.transaction("rw", db.projects, db.assets, db.modules, async () => {
    await db.assets.bulkPut(storedAssets);
    await db.modules.bulkPut(result.project.customModules);
    await db.projects.put(result.project);
  });
  return result.project;
}
