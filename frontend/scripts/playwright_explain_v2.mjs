import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const conversationId = "d90d22dc-9133-4e0f-ada5-83e98eea60a2";
const brainScreenshotsDir = `/Users/het09/.gemini/antigravity/brain/${conversationId}/screenshots`;
const repoScreenshotsDir = path.resolve("./docs/screenshots");

for (const dir of [brainScreenshotsDir, repoScreenshotsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  console.log("Launching Chromium for Ticket 4 Explain Detail v2 verification...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const saveScreenshot = async (filename, options = {}) => {
    const p1 = path.join(brainScreenshotsDir, filename);
    const p2 = path.join(repoScreenshotsDir, filename);
    await page.screenshot({ path: p1, ...options });
    fs.copyFileSync(p1, p2);
    console.log(`Saved screenshot: ${filename}`);
  };

  try {
    // 1. Visit /dashboards
    console.log("Navigating to http://localhost:3000/dashboards...");
    await page.goto("http://localhost:3000/dashboards", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Click first dashboard card
    const card = page.locator("a[href^='/dashboards/']").first();
    if (await card.isVisible()) {
      console.log("Clicking dashboard card...");
      await card.click();
    } else {
      console.log("Creating or navigating to demo dashboard...");
      await page.goto("http://localhost:3000/dashboards/14ee0e3e-cba2-42fe-aadd-c3d55e8ceddf", { waitUntil: "networkidle" });
    }

    await page.waitForTimeout(3000);

    // Click explain button on primary chart
    console.log("Triggering Explain modal...");
    const explainBtn = page.locator("button[data-testid^='btn-explain-']").first();
    if (await explainBtn.isVisible()) {
      await explainBtn.click();
    } else {
      console.log("Looking for any explain button...");
      await page.locator("text=Explain").first().click();
    }

    // Wait for Explain dialog to stream and render
    await page.waitForSelector("[role='dialog']", { timeout: 15000 });
    // Wait for analysis to complete
    await page.waitForSelector("[data-testid='dimension-selector-waterfall'], [data-testid='explain-headline']", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // Focus on dialog for screenshots
    const dialogElement = page.locator("[role='dialog']");

    // 1. Dimension Waterfall & Selector - Light Mode
    console.log("Capturing explain_v2_dimension_light.png...");
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(600);
    await saveScreenshot("explain_v2_dimension_light.png");

    // 2. Dimension Waterfall & Selector - Dark Mode
    console.log("Capturing explain_v2_dimension_dark.png...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(600);
    await saveScreenshot("explain_v2_dimension_dark.png");

    // Switch to Evidence Tab for Timing and Table
    console.log("Clicking Evidence tab...");
    const evTab = page.locator("button:has-text('Evidence')").first();
    if (await evTab.isVisible()) {
      await evTab.click();
      await page.waitForTimeout(800);
    }

    // 3. Timing & Segment Comparison Table - Dark Mode
    console.log("Capturing explain_v2_timing_table_dark.png...");
    await saveScreenshot("explain_v2_timing_table_dark.png");

    // 4. Timing & Segment Comparison Table - Light Mode
    console.log("Capturing explain_v2_timing_table_light.png...");
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(600);
    await saveScreenshot("explain_v2_timing_table_light.png");

    // Switch to Summary Tab or ratio decomposition view
    console.log("Clicking Summary tab...");
    const sumTab = page.locator("button:has-text('Summary')").first();
    if (await sumTab.isVisible()) {
      await sumTab.click();
      await page.waitForTimeout(800);
    }

    // 5. Ratio Decomposition & Next Inquiries - Light Mode
    console.log("Capturing explain_v2_ratio_decomposition_light.png...");
    await saveScreenshot("explain_v2_ratio_decomposition_light.png");

    // 6. Ratio Decomposition & Next Inquiries - Dark Mode
    console.log("Capturing explain_v2_ratio_decomposition_dark.png...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(600);
    await saveScreenshot("explain_v2_ratio_decomposition_dark.png");

    console.log("All Explain Detail v2 screenshots successfully captured!");
  } catch (err) {
    console.error("Playwright script encountered error:", err);
    throw err;
  } finally {
    await browser.close();
  }
}

run();
