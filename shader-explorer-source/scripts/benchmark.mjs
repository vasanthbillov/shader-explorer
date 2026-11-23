/** Hardware-specific, non-CI performance sample. Start the dev server first. */
import { firefox } from "@playwright/test";
import { cpus, platform, release } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
const names = [
  "Iridescent Sphere",
  "Lava Surface",
  "Ocean Surface",
  "Stylized Clouds",
  "Energy Field",
  "Crystal Material",
  "Holographic Grid",
  "Fluid Smoke",
  "Toon Surface",
  "Dissolve Object",
  "Procedural Terrain",
  "Chromatic Post Effect",
];
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("dialog", (dialog) => dialog.accept());
const report = {
  capturedAt: new Date().toISOString(),
  os: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  browser: `Firefox ${browser.version()}`,
  resolution: "1280x720",
  gpu: "",
  note: "FPS and CPU frame intervals sampled from the UI. These are not GPU timer queries or VRAM measurements.",
  results: [],
};
try {
  for (const name of names) {
    await page.goto(process.env.SHADER_LAB_URL || "http://127.0.0.1:5173/");
    await page.getByLabel("Search shaders").fill(name);
    await page
      .getByRole("button", { name: `Open ${name} in editor`, exact: true })
      .first()
      .click();
    await page
      .locator(".code-status")
      .getByText("Compiled", { exact: true })
      .waitFor();
    await page.getByLabel("Render resolution").selectOption("1280x720");
    await page
      .locator(".metrics-detail")
      .filter({ hasText: "1280 × 720" })
      .waitFor();
    if (!report.gpu)
      report.gpu = await page
        .locator(".canvas-host canvas")
        .evaluate((canvas) => {
          const gl = canvas.getContext("webgl2");
          const info = gl.getExtension("WEBGL_debug_renderer_info");
          return info
            ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
            : "Not exposed";
        });
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      await new Promise((resolve) => setTimeout(resolve, 550));
      samples.push(
        Number.parseInt(await page.locator(".fps-counter").innerText()),
      );
    }
    const target = ["Stylized Clouds", "Fluid Smoke"].includes(name) ? 30 : 60;
    const fps = Math.round(
      samples.reduce((sum, n) => sum + n, 0) / samples.length,
    );
    const entry = {
      name,
      fps,
      samples,
      target,
      meetsTarget: fps >= target,
      metrics: await page.locator(".metrics-detail").innerText(),
      resources: await page.locator(".metrics-detail").getAttribute("title"),
    };
    report.results.push(entry);
    console.log(`${name}: ${fps} FPS (target ${target})`);
  }
  await mkdir("output/playwright", { recursive: true });
  await writeFile(
    "output/playwright/performance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(`Renderer: ${report.gpu}`);
} finally {
  await browser.close();
}
