import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import {
  type ShaderBuild,
  type ShaderProject,
  type UniformValue,
  type Diagnostic,
  type AssetRecord,
  type UniformDefinition,
} from "../shared/types";
import { mapDiagnostics } from "./composition";
export interface Metrics {
  fps: number;
  frameMs: number;
  compileMs: number;
  geometries: number;
  textures: number;
  programs: number;
  resolution: string;
  time: number;
}
export class ShaderRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  readonly controls: OrbitControls;
  private object: THREE.Object3D = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshBasicMaterial(),
  );
  private material?: THREE.RawShaderMaterial;
  private uniforms: Record<string, THREE.IUniform> = {};
  private definitions: UniformDefinition[] = [];
  private textures = new Map<string, THREE.Texture>();
  private frame = 0;
  private disposed = false;
  private compiling = 0;
  private geometrySeq = 0;
  private resizeObserver: ResizeObserver;
  private dirty = true;
  private last = 0;
  private elapsed = 0;
  private metricsAt = 0;
  private frames = 0;
  private compileMs = 0;
  private width = 1;
  private height = 1;
  private restore?: () => void;
  private composer?: EffectComposer;
  private bloomPass?: UnrealBloomPass;
  playing = true;
  speed = 1;
  rotate = false;
  quality: "standard" | "low" = "standard";
  resolution = "auto";
  onMetrics?: (metrics: Metrics) => void;
  onContext?: (lost: boolean) => void;
  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x080c16, 0);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 3.7);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 12;
    this.controls.addEventListener("change", this.invalidate);
    this.scene.add(this.object);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    document.addEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.addEventListener("pointermove", this.pointer);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  private pointer = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.uniforms.uPointer?.value.set(
      (e.clientX - r.left) / r.width,
      (e.clientY - r.top) / r.height,
    );
    this.dirty = true;
  };
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.onContext?.(true);
  };
  private contextRestored = () => {
    const bloom = !!this.composer;
    if (bloom) {
      this.setBloom(false);
      this.setBloom(true);
    }
    this.onContext?.(false);
    this.restore?.();
    this.dirty = true;
  };
  setRestore(fn: () => void) {
    this.restore = fn;
  }
  setBloom(enabled: boolean) {
    if (enabled === !!this.composer) return;
    if (enabled) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height),
        0.5,
        0.6,
        0.6,
      );
      this.composer.addPass(this.bloomPass);
      // The editable shader already encodes its output. A plain final copy
      // avoids the bloom pass's screen material applying gamma a second time.
      this.composer.addPass(new ShaderPass(CopyShader));
      this.composer.setSize(this.width, this.height);
      this.scene.background = new THREE.Color().setRGB(0.025, 0.035, 0.065);
    } else {
      this.composer?.passes.forEach((pass) => pass.dispose());
      this.composer?.dispose();
      this.bloomPass = undefined;
      this.composer = undefined;
      this.scene.background = null;
    }
    this.dirty = true;
  }
  private renderFrame() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  private visibility = () => {
    this.last = 0;
    this.dirty = true;
  };
  private invalidate = () => {
    this.dirty = true;
  };
  resize = () => {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let w = r.width,
      h = r.height;
    if (this.resolution !== "auto") {
      [w, h] = this.resolution.split("x").map(Number);
    } else {
      const dpr = Math.min(
        devicePixelRatio || 1,
        this.quality === "low" ? 0.75 : 1.5,
      );
      w *= dpr;
      h *= dpr;
    }
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.renderer.setSize(this.width, this.height, false);
    this.composer?.setSize(this.width, this.height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uResolution?.value.set(this.width, this.height);
    this.dirty = true;
  };
  private tick = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden) {
      this.last = 0;
      return;
    }
    const delta = this.last ? Math.min((time - this.last) / 1000, 0.1) : 0;
    this.last = time;
    if (this.playing) {
      this.elapsed = (this.elapsed + delta * this.speed) % 30;
      this.dirty = true;
    }
    if (this.rotate && this.playing) this.object.rotation.y += delta * 0.2;
    if (this.uniforms.uTime) this.uniforms.uTime.value = this.elapsed;
    if (this.uniforms.uDelta) this.uniforms.uDelta.value = delta;
    if (this.dirty && this.material) {
      this.renderFrame();
      this.dirty = false;
      this.frames++;
    }
    if (time - this.metricsAt > 500) {
      this.onMetrics?.({
        fps: this.playing
          ? Math.round((this.frames * 1000) / (time - this.metricsAt))
          : 0,
        frameMs: delta * 1000,
        compileMs: this.compileMs,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        programs: this.renderer.info.programs?.length || 0,
        resolution: `${this.width} × ${this.height}`,
        time: this.elapsed,
      });
      this.frames = 0;
      this.metricsAt = time;
    }
  };
  async compile(
    build: ShaderBuild,
    values: Record<string, UniformValue>,
    assets: AssetRecord[],
  ): Promise<Diagnostic[]> {
    const seq = ++this.compiling,
      start = performance.now(),
      gl = this.renderer.getContext();
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      const diagnostics: Diagnostic[] = [];
      for (const stage of ["vertex", "fragment"] as const) {
        const shader = gl.createShader(
          stage === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER,
        );
        if (!shader) throw Error("Unable to allocate GPU shader");
        shaders.push(shader);
        gl.shaderSource(shader, build[stage]);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          diagnostics.push(
            ...mapDiagnostics(
              gl.getShaderInfoLog(shader) || "Shader compilation failed",
              stage,
              build,
            ),
          );
      }
      if (diagnostics.length) return diagnostics;
      program = gl.createProgram();
      if (!program) throw Error("Unable to allocate GPU program");
      shaders.forEach((s) => gl.attachShader(program!, s));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        return [
          {
            severity: "error",
            message: gl.getProgramInfoLog(program) || "Shader link failed",
          },
        ];
    } finally {
      shaders.forEach((s) => gl.deleteShader(s));
      if (program) gl.deleteProgram(program);
    }
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: this.elapsed },
      uDelta: { value: 0 },
      uResolution: { value: new THREE.Vector2(this.width, this.height) },
      uPointer: { value: new THREE.Vector2() },
    };
    for (const d of build.uniforms)
      uniforms[d.name] = {
        value: await this.convertValue(
          d.type,
          values[d.name] ?? d.default,
          assets,
          d,
        ),
      };
    const candidate = new THREE.RawShaderMaterial({
      vertexShader: build.vertex.replace(/^#version 300 es\n/, ""),
      fragmentShader: build.fragment.replace(/^#version 300 es\n/, ""),
      uniforms,
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
    });
    const probe = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), candidate);
    const scene = new THREE.Scene();
    scene.add(probe);
    try {
      await this.renderer.compileAsync(scene, this.camera);
    } catch (e) {
      candidate.dispose();
      return [{ severity: "error", message: String(e) }];
    } finally {
      probe.geometry.dispose();
    }
    if (seq !== this.compiling || this.disposed) {
      candidate.dispose();
      return [];
    }
    const previous = this.material;
    this.material = candidate;
    this.definitions = build.uniforms;
    this.uniforms = uniforms;
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const old = o.material;
        o.material = candidate;
        if (old !== previous) {
          (Array.isArray(old) ? old : [old]).forEach((m) => m.dispose());
        }
      }
    });
    previous?.dispose();
    this.compileMs = performance.now() - start;
    this.dirty = true;
    return [];
  }
  private async convertValue(
    type: string,
    value: UniformValue,
    assets: AssetRecord[],
    definition?: { wrap?: string; filter?: string; colorSpace?: string },
  ): Promise<unknown> {
    if (type === "color") return new THREE.Color(String(value));
    if (type === "vec2")
      return new THREE.Vector2(...(value as [number, number]));
    if (type === "vec3")
      return new THREE.Vector3(...(value as [number, number, number]));
    if (type === "vec4")
      return new THREE.Vector4(...(value as [number, number, number, number]));
    if (type === "sampler2D") {
      const cacheKey = JSON.stringify([
        value,
        definition?.wrap,
        definition?.filter,
        definition?.colorSpace,
      ]);
      if (this.textures.has(cacheKey)) return this.textures.get(cacheKey);
      const asset = assets.find((a) => a.id === value);
      let texture: THREE.Texture;
      if (asset) {
        const url = URL.createObjectURL(asset.blob);
        try {
          texture = await new THREE.TextureLoader().loadAsync(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        texture = new THREE.DataTexture(
          new Uint8Array([255, 255, 255, 255]),
          1,
          1,
        );
        texture.needsUpdate = true;
      }
      texture.wrapS = texture.wrapT =
        definition?.wrap === "clamp"
          ? THREE.ClampToEdgeWrapping
          : definition?.wrap === "mirror"
            ? THREE.MirroredRepeatWrapping
            : THREE.RepeatWrapping;
      texture.magFilter =
        definition?.filter === "nearest"
          ? THREE.NearestFilter
          : THREE.LinearFilter;
      texture.minFilter =
        definition?.filter === "nearest"
          ? THREE.NearestFilter
          : THREE.LinearMipmapLinearFilter;
      texture.colorSpace =
        definition?.colorSpace === "linear"
          ? THREE.NoColorSpace
          : THREE.SRGBColorSpace;
      this.textures.set(cacheKey, texture);
      return texture;
    }
    return value;
  }
  async updateUniforms(project: ShaderProject, assets: AssetRecord[]) {
    for (const def of project.uniformDefinitions) {
      if (
        def.storage !== "constant" &&
        this.uniforms[def.name] &&
        this.definitions.some((d) => d.name === def.name && d.type === def.type)
      )
        this.uniforms[def.name].value = await this.convertValue(
          def.type,
          project.uniforms[def.name] ?? def.default,
          assets,
          def,
        );
    }
    this.dirty = true;
  }
  async setGeometry(
    kind: ShaderProject["preview"]["geometry"],
    asset?: AssetRecord,
  ) {
    const geometrySeq = ++this.geometrySeq;
    let object: THREE.Object3D;
    if (kind === "custom" && asset) {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (url.startsWith("blob:")) return url;
        throw Error("External model resources are blocked");
      });
      const gltf = await new GLTFLoader(manager).parseAsync(
        await asset.blob.arrayBuffer(),
        "",
      );
      object = gltf.scene;
      const box = new THREE.Box3().setFromObject(object),
        size = box.getSize(new THREE.Vector3()),
        center = box.getCenter(new THREE.Vector3());
      const wrapper = new THREE.Group();
      object.position.sub(center);
      wrapper.add(object);
      wrapper.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.001));
      object = wrapper;
    } else
      object = new THREE.Mesh(
        kind === "cube"
          ? new THREE.BoxGeometry(1.55, 1.55, 1.55, 12, 12, 12)
          : kind === "plane"
            ? new THREE.PlaneGeometry(2.7, 2.7, 64, 64)
            : new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshBasicMaterial(),
      );
    if (this.disposed || geometrySeq !== this.geometrySeq) {
      this.disposeObject(object);
      return;
    }
    this.scene.remove(this.object);
    this.disposeObject(this.object);
    this.object = object;
    object.traverse((o) => {
      if (o instanceof THREE.Mesh && this.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m !== this.material) {
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) {
                if (
                  typeof ImageBitmap !== "undefined" &&
                  value.image instanceof ImageBitmap
                )
                  value.image.close();
                value.dispose();
              }
            m.dispose();
          }
        });
        o.material = this.material;
      }
    });
    this.scene.add(object);
    this.dirty = true;
  }
  private disposeObject(object: THREE.Object3D) {
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m !== this.material) {
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) {
                if (
                  typeof ImageBitmap !== "undefined" &&
                  value.image instanceof ImageBitmap
                )
                  value.image.close();
                value.dispose();
              }
            m.dispose();
          }
        });
      }
    });
  }
  setTime(t: number) {
    this.elapsed = t;
    if (this.uniforms.uTime) this.uniforms.uTime.value = t;
    this.dirty = true;
  }
  reset() {
    this.camera.position.set(0, 0, 3.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.object.rotation.set(0, 0, 0);
    this.elapsed = 0;
    this.dirty = true;
  }
  capture(thumbnail = false): string {
    const time = this.elapsed,
      rot = this.object.rotation.clone(),
      pos = this.camera.position.clone(),
      target = this.controls.target.clone();
    if (thumbnail) {
      this.reset();
      if (this.uniforms.uTime) this.uniforms.uTime.value = 2;
    }
    this.renderFrame();
    let result = this.renderer.domElement.toDataURL("image/png");
    if (thumbnail) {
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 288;
      const source = this.renderer.domElement;
      const cropWidth = Math.min(source.width, (source.height * 4) / 3);
      const cropHeight = Math.min(source.height, (source.width * 3) / 4);
      canvas
        .getContext("2d")
        ?.drawImage(
          source,
          (source.width - cropWidth) / 2,
          (source.height - cropHeight) / 2,
          cropWidth,
          cropHeight,
          0,
          0,
          384,
          288,
        );
      result = canvas.toDataURL("image/webp", 0.8);
      this.elapsed = time;
      this.object.rotation.copy(rot);
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      if (this.uniforms.uTime) this.uniforms.uTime.value = time;
      this.dirty = true;
    }
    return result;
  }
  dispose() {
    this.disposed = true;
    this.compiling++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener("pointermove", this.pointer);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.contextRestored,
    );
    this.controls.dispose();
    this.disposeObject(this.object);
    this.material?.dispose();
    this.textures.forEach((t) => t.dispose());
    this.setBloom(false);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
