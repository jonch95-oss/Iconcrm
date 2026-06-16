import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1380, height: 950 } });
page.setDefaultTimeout(60000);
const log = [];
try {
  await page.goto("http://localhost:3000/login");
  await page.locator('#email').fill("jonc@iconluxurygroup.com");
  await page.locator('#password').fill("Icon@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://localhost:3000/", { timeout: 60000 });

  await page.goto("http://localhost:3000/samples");
  await page.waitForLoadState("networkidle");
  const firstNum = (await page.locator('table tbody tr td a').first().textContent())?.trim();
  log.push("first sample #: " + firstNum);

  // dup warning
  await page.getByRole("button", { name: "New sample" }).click();
  await page.waitForTimeout(800);
  await page.locator('input[name="sampleNumber"]').fill(firstNum);
  await page.locator('input[name="sampleNumber"]').blur();
  await page.waitForTimeout(2500);
  log.push("dup warning visible: " + (await page.getByText(/already exists/).count() > 0));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // detail: delete button as owner/admin
  await page.locator('table tbody tr td a').first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  log.push("Delete button visible: " + (await page.getByRole("button", { name: "Delete" }).count() > 0));
  log.push("Edit button visible: " + (await page.getByRole("button", { name: "Edit" }).count() > 0));
} catch (e) { log.push("ERROR: " + e.message.slice(0,150)); }
console.log(JSON.stringify(log, null, 2));
await b.close();
