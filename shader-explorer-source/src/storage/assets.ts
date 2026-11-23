import { type AssetRecord, uid } from "../shared/types";
const MB = 1024 * 1024;
export async function validateAsset(file: File): Promise<AssetRecord> {
  if (file.size > 20 * MB) throw Error("Assets must be 20MB or smaller.");
  const buffer = await file.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const base = {
    id: uid(),
    hash,
    name: file.name,
    mime: file.type,
    blob: file,
  };
  if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
    if (file.size > 10 * MB) throw Error("Textures must be 10MB or smaller.");
    const bytes = new Uint8Array(buffer);
    const valid =
      (bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71) ||
      (bytes[0] === 255 && bytes[1] === 216) ||
      (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
    if (!valid) throw Error("Invalid image format. Use PNG, JPEG, or WebP.");
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (width > 4096 || height > 4096)
      throw Error("Textures cannot exceed 4096 × 4096.");
    const mime =
      bytes[0] === 137
        ? "image/png"
        : bytes[0] === 255
          ? "image/jpeg"
          : "image/webp";
    return {
      ...base,
      mime,
      blob: new Blob([buffer], { type: mime }),
      kind: "texture",
      width,
      height,
    };
  }
  if (!/\.glb$/i.test(file.name))
    throw Error("Choose a PNG, JPEG, WebP, or self-contained GLB.");
  if (file.size > 20 * MB) throw Error("Models must be 20MB or smaller.");
  const view = new DataView(buffer);
  if (
    view.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Invalid GLB 2.0 file.");
  const len = view.getUint32(12, true);
  if (20 + len > buffer.byteLength) throw Error("Invalid GLB JSON chunk.");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, len)),
  );
  if (
    [...(json.buffers || []), ...(json.images || [])].some(
      (r: { uri?: string }) => r.uri,
    )
  )
    throw Error("GLB must embed all resources in buffer views.");
  if (json.skins?.length || json.animations?.length)
    throw Error("Only static GLB models are supported.");
  if (
    (json.extensionsUsed || []).some((x: string) =>
      /draco|meshopt|basisu/i.test(x),
    )
  )
    throw Error("Compressed GLB assets are not supported.");
  if (
    (json.images || []).some(
      (image: { mimeType?: string }) =>
        !["image/png", "image/jpeg", "image/webp"].includes(
          image.mimeType || "",
        ),
    )
  )
    throw Error("Embedded model textures must be PNG, JPEG, or WebP.");
  let triangles = 0;
  for (const mesh of json.meshes || [])
    for (const p of mesh.primitives || []) {
      if (
        p.targets?.length ||
        (p.mode !== undefined && p.mode !== 4) ||
        p.attributes?.JOINTS_0 !== undefined
      )
        throw Error("Use static triangle meshes without morph targets.");
      if (p.attributes?.NORMAL === undefined)
        throw Error("Model meshes need normals.");
      const count = json.accessors?.[p.indices ?? p.attributes.POSITION]?.count;
      if (typeof count !== "number") throw Error("Invalid mesh accessor.");
      triangles += count / 3;
    }
  if (!triangles || triangles > 250000)
    throw Error("Models must contain 1–250,000 triangles.");
  // Parse before persistence: metadata alone does not establish a valid model.
  const [{ GLTFLoader }, THREE] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three"),
  ]);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:")) return url;
    throw Error("External model resources are blocked.");
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            if (
              typeof ImageBitmap !== "undefined" &&
              value.image instanceof ImageBitmap
            )
              value.image.close();
            value.dispose();
          }
        }
        material.dispose();
      }
    }
  });
  return { ...base, mime: "model/gltf-binary", kind: "model", triangles };
}
