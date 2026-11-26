import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const conversationId = "0613038c-fb27-4cd5-91a4-100eb592477e";
const brainScreenshotsDir = `/Users/het09/.gemini/antigravity/brain/${conversationId}/screenshots`;
const repoScreenshotsDir = path.resolve("./docs/screenshots");

for (const dir of [brainScreenshotsDir, repoScreenshotsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function capture() {
  console.log("Launching chromium...");
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

  // 1. Data Page - Step Indicator - Light Mode
  console.log("Navigating to /data...");
  await page.goto("http://localhost:3002/data", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.waitForTimeout(600);
  await saveScreenshot("data_step_indicator_light.png");

  // 2. Data Page - Step Indicator - Dark Mode
  console.log("Capturing Step Indicator - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("data_step_indicator_dark.png");

  // Ensure a demo connection & model & dashboard exist for testing
  console.log("Navigating to /data?tab=model...");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.goto("http://localhost:3002/data?tab=model", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // If empty state button exists, click it to confirm default ecommerce set
  const seedBtn = page.locator('button[data-testid="seed-ecommerce-button"]');
  if (await seedBtn.isVisible()) {
    console.log("Seeding default ecommerce set...");
    await seedBtn.click();
    await page.waitForTimeout(2000);
  }

  // 3. Model Page - Create Dashboard Button - Light Mode
  console.log("Capturing Model Page with Create Dashboard button - Light Mode...");
  await page.waitForSelector('[data-testid="btn-create-dashboard-from-model"]');
  await saveScreenshot("model_create_dashboard_light.png");

  // 4. Model Page - Create Dashboard Button - Dark Mode
  console.log("Capturing Model Page with Create Dashboard button - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("model_create_dashboard_dark.png");

  // Switch back to light mode and ensure a dashboard exists
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  });

  // Click "Create dashboard from this data" to open dialog and build dashboard
  console.log("Clicking 'Create dashboard from this data'...");
  const createDashBtn = page.locator('[data-testid="btn-create-dashboard-from-model"]');
  await createDashBtn.click();
  await page.waitForTimeout(500);

  const submitBuildBtn = page.locator('[data-testid="btn-submit-create-dashboard"]');
  if (await submitBuildBtn.isVisible()) {
    console.log("Building dashboard...");
    await submitBuildBtn.click();
    await page.waitForTimeout(2500);
  }

  // Now return to /data?tab=model to test dependency warning
  console.log("Returning to /data?tab=model to test dependency warning...");
  await page.goto("http://localhost:3002/data?tab=model", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Click Delete Model
  console.log("Prompting Delete Model with dependents...");
  const deleteModelBtn = page.locator('[data-testid="btn-delete-model"]');
  await deleteModelBtn.waitFor({ state: "visible" });
  await deleteModelBtn.click();
  await page.waitForTimeout(600);

  // 5. Model Dependency Warning Dialog - Light Mode
  console.log("Capturing Dependency Warning Dialog - Light Mode...");
  await page.waitForSelector('[data-testid="dependency-warning-dialog"]');
  await saveScreenshot("model_dependency_warning_light.png");

  // 6. Model Dependency Warning Dialog - Dark Mode
  console.log("Capturing Dependency Warning Dialog - Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await page.waitForTimeout(400);
  await saveScreenshot("model_dependency_warning_dark.png");

  await browser.close();
  console.log("Screenshot capture complete!");
}

capture().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
