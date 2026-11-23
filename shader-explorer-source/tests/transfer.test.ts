import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parsePackage } from "../src/storage/transfer";
import { newProject } from "../src/content/projects";
function packageFile(files: Record<string, Uint8Array>) {
  return new File(
    [zipSync(files) as Uint8Array<ArrayBuffer>],
    "test.shaderlab.zip",
  );
}
const manifest = { format: "shaderlab", schemaVersion: 1, assets: [] };
describe("portable project validation", () => {
  it("imports an asset-free package under a new identity", async () => {
    const p = newProject();
    const file = packageFile({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "project.json": strToU8(JSON.stringify(p)),
    });
    const result = await parsePackage(file);
    expect(result.project.id).not.toBe(p.id);
    expect(result.project.fragmentBody).toBe(p.fragmentBody);
  });
  it("preserves invalid editable GLSL for recovery", async () => {
    const p = newProject();
    p.fragmentBody = "NOT VALID GLSL";
    const result = await parsePackage(
      new File([JSON.stringify(p)], "test.json"),
    );
    expect(result.project.fragmentBody).toBe(p.fragmentBody);
  });
  it("rejects unsupported schema versions", async () => {
    const p = { ...newProject(), schemaVersion: 99 };
    await expect(
      parsePackage(new File([JSON.stringify(p)], "test.json")),
    ).rejects.toThrow();
  });
  it("rejects traversal paths", async () => {
    await expect(
      parsePackage(packageFile({ "../evil": strToU8("x") })),
    ).rejects.toThrow("Unsafe");
  });
  it("rejects missing manifest and missing assets", async () => {
    await expect(
      parsePackage(packageFile({ "project.json": strToU8("{}") })),
    ).rejects.toThrow("manifest");
    const p = newProject();
    p.assets = ["missing"];
    await expect(
      parsePackage(new File([JSON.stringify(p)], "test.json")),
    ).rejects.toThrow("external assets");
  });
  it("rejects missing pinned module versions", async () => {
    const p = newProject();
    p.modules = [{ id: "missing", version: "99", enabled: true }];
    await expect(
      parsePackage(new File([JSON.stringify(p)], "test.json")),
    ).rejects.toThrow(/Missing.*module/);
  });
  it("rejects entry count bombs before extraction", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [String(i), new Uint8Array()]),
    );
    await expect(parsePackage(packageFile(files))).rejects.toThrow("limits");
  });
});

describe("disabled and untrusted project state", () => {
  it("preserves disabled custom function source", async () => {
    const p = newProject();
    p.customModules.push({
      id: "custom",
      version: "local-1",
      name: "custom()",
      category: "Custom",
      description: "Custom source",
      source: "float custom(float x){ return x; }",
      exports: ["custom"],
      dependencies: [],
      uniforms: [],
      stages: ["fragment"],
      usage: "custom(1.0)",
      author: "Local",
      license: "MIT",
    });
    p.modules.push({ id: "custom", version: "local-1", enabled: false });
    const result = await parsePackage(
      new File([JSON.stringify(p)], "test.json"),
    );
    expect(result.project.customModules[0].source).toContain("float custom");
    expect(result.project.modules.find((m) => m.id === "custom")?.enabled).toBe(
      false,
    );
  });
  it("removes network-loaded thumbnail references from imports", async () => {
    const p = {
      ...newProject(),
      thumbnail: "https://example.com/tracking.png",
    };
    const result = await parsePackage(
      new File([JSON.stringify(p)], "test.json"),
    );
    expect(result.project.thumbnail).toBeUndefined();
  });
});

it("remaps textures retained only by the last successful build", async () => {
  const { rebindAssets } = await import("../src/storage/transfer");
  const project = newProject();
  project.assets = ["texture"];
  project.lastSuccessful = {
    vertex: "v",
    fragment: "f",
    uniformDefinitions: [
      {
        name: "uOldTexture",
        type: "sampler2D",
        group: "Textures",
        default: "texture",
      },
    ],
    uniforms: { uOldTexture: "texture" },
  };
  const map = rebindAssets(project, [
    {
      id: "texture",
      kind: "texture",
      name: "x.png",
      hash: "x",
      mime: "image/png",
      blob: new Blob(),
    },
  ]);
  expect(project.lastSuccessful.uniforms?.uOldTexture).toBe(map.get("texture"));
  expect(project.lastSuccessful.uniformDefinitions?.[0].default).toBe(
    map.get("texture"),
  );
});
