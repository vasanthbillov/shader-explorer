import {
  Code2,
  Layers,
  HardDrive,
  Box,
  Keyboard,
  Download,
} from "lucide-react";
export default function Docs() {
  return (
    <div className="content-page docs-page">
      <div className="eyebrow">A LITTLE GUIDANCE, A LOT OF POSSIBILITY</div>
      <h1>Make light work.</h1>
      <p className="docs-intro">
        Your field guide to creating, composing, and keeping real-time shaders.
      </p>
      <div className="docs-grid">
        {[
          [
            Code2,
            "01 / Create & compile",
            "Open any example to create an independent local project, or start with Create Shader. Edit the vertex or fragment body and press Ctrl/Cmd+Enter. Compilation is manual unless you enable Auto compile. Errors retain the last successful preview.",
          ],
          [
            Layers,
            "02 / Compose functions",
            "Add reusable GLSL modules from the function library. Their dependencies are included automatically. Adding a function makes it callable; it does not apply an effect. Use the documented usage example in your shader body. Noise, Lighting, and Distortion switches control explicit composition hooks.",
          ],
          [
            Box,
            "03 / Shape & surface",
            "Preview on a sphere, cube, plane, or imported static GLB. Drag to orbit and scroll to zoom. Texture uniforms accept PNG, JPEG, or WebP up to 4096px and 10MB. GLB files must be self-contained, uncompressed, static, under 20MB and 250,000 triangles. Models need normals; texture mapping also needs UVs.",
          ],
          [
            HardDrive,
            "04 / Save & recover",
            "Save writes the current project to this browser. Save Version creates an immutable snapshot. A recovery draft is stored after edits settle. Reopening offers recovery if it is newer than the saved project. Browser data is local and can be cleared by the browser; keep exported backups.",
          ],
          [
            Download,
            "05 / Take it with you",
            "Export a .shaderlab.zip package for a complete editable project including pinned modules and assets. Asset-free projects can use JSON. GLSL source export includes assembled vertex/fragment shaders and the runtime uniform contract; adapt them for other engines.",
          ],
          [
            Keyboard,
            "06 / Find your flow",
            "Ctrl/Cmd+Enter compiles. Ctrl/Cmd+S saves. Preview, parameter resets, and source changes are independent. In narrow layouts, use Preview, Code, Functions, and Parameters tabs. Panel dividers support arrow keys on desktop.",
          ],
        ].map(([Icon, title, text]) => (
          <section className="docs-card" key={String(title)}>
            <Icon size={24} />
            <h2>{String(title)}</h2>
            <p>{String(text)}</p>
          </section>
        ))}
      </div>
      <section className="docs-contract">
        <h2>The shader contract</h2>
        <p>
          Shader Explorer owns the GLSL version, declarations, and main entry
          point. Edit a shader body without adding <code>#version</code> or{" "}
          <code>main()</code>.
        </p>
        <pre>{`// Fragment body variables\nvec2 uv;           // UV coordinates\nvec3 position;     // world position\nvec3 normal;       // world normal\nvec3 viewDir;      // direction to camera\nvec3 color;        // write your linear RGB color here\n\n// Engine uniforms\nuTime;             // looping 0–30 seconds\nuDelta;            // seconds since last frame\nuResolution;       // render size in pixels\nuPointer;          // normalized pointer position\n\n// Vertex body: modify localPosition before projection\nlocalPosition += normal * sin(uTime) * 0.05;`}</pre>
        <p>
          Final output uses Reinhard tone mapping and gamma encoding. The
          examples are original stylized studies released under MIT. Clouds,
          smoke, and crystal are procedural illustrations, rather than physical
          simulations.
        </p>
      </section>
    </div>
  );
}
