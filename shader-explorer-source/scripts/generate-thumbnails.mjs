/** Generate honest, fixed-time thumbnails through the public editor workflow.
 * Start `npm run dev` first. Run `npm run thumbnails` after editing examples.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
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
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await mkdir("public/thumbnails", { recursive: true });
try {
  for (const [index, name] of names.entries()) {
    if (process.argv[2] !== undefined && index !== Number(process.argv[2]))
      continue;
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
    const pause = page.getByRole("button", {
      name: "Pause animation",
      exact: true,
    });
    if (await pause.count()) await pause.click();
    await page.getByLabel("Animation timeline").press("Home");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Capture screenshot", exact: true })
      .click();
    await (await downloadPromise).saveAs(`public/thumbnails/${index}.png`);
    if (index === 0)
      await page.screenshot({
        path: "output/playwright/editor-chromium.png",
        fullPage: true,
      });
    console.log(`Rendered ${name}`);
  }
} finally {
  await browser.close();
}
