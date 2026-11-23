import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateAsset } from "../src/storage/assets";
function glb(json: Record<string, unknown>) {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const size = Math.ceil(raw.length / 4) * 4;
  const result = new ArrayBuffer(20 + size);
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20).fill(32);
  new Uint8Array(result, 20, raw.length).set(raw);
  return new File([result], "model.glb");
}
const model = () => ({
  asset: { version: "2.0" },
  accessors: [{ count: 3 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 0 } }] }],
});
describe("local model import restrictions", () => {
  it("accepts bounded static triangle metadata", async () => {
    const bytes = readFileSync("tests/fixtures/triangle.glb");
    const result = await validateAsset(new File([bytes], "model.glb"));
    expect(result.kind).toBe("model");
    expect(result.triangles).toBe(1);
    expect(result.hash).toHaveLength(64);
  });
  it("rejects external buffers", async () => {
    await expect(
      validateAsset(
        glb({
          ...model(),
          buffers: [{ uri: "https://example.com/private.bin" }],
        }),
      ),
    ).rejects.toThrow("embed");
  });
  it("rejects animations", async () => {
    await expect(
      validateAsset(glb({ ...model(), animations: [{}] })),
    ).rejects.toThrow("static");
  });
  it("rejects unsupported compression", async () => {
    await expect(
      validateAsset(
        glb({ ...model(), extensionsUsed: ["KHR_draco_mesh_compression"] }),
      ),
    ).rejects.toThrow("Compressed");
  });
  it("rejects oversized geometry", async () => {
    await expect(
      validateAsset(glb({ ...model(), accessors: [{ count: 900000 }] })),
    ).rejects.toThrow("250,000");
  });
  it("rejects meshes without normals", async () => {
    await expect(
      validateAsset(
        glb({
          ...model(),
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        }),
      ),
    ).rejects.toThrow("normals");
  });
  it("rejects incorrect image signatures", async () => {
    await expect(
      validateAsset(new File(["not an image"], "image.png")),
    ).rejects.toThrow("Invalid image");
  });
});
