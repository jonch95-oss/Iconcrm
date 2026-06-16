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
  log.push("login OK");

  // New-sample dialog: color field + duplicate warning
  await page.goto("http://localhost:3000/samples");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "New sample" }).click();
  await page.waitForTimeout(600);
  const hasColor = await page.locator('input[name="color"]').count();
  log.push("new-sample color field: " + (hasColor > 0));
  // type an existing sample # to trigger dup warning
  const firstNum = await page.locator('table tbody tr td a').first().textContent().catch(()=>null);
  await page.locator('input[name="sampleNumber"]').fill(firstNum || "S-2026-1001");
  await page.locator('input[name="brand"]').click(); // blur the # field
  await page.waitForTimeout(1500);
  const warn = await page.locator (("text=already exists")).count().catch(()=>0);
  log.push("duplicate warning shows: " + (warn > 0));
  await page.keyboard.press("Escape");

  // Sample detail: color + delete button (admin)
  await page.locator('table tbody tr td a').first().click();
  await page.waitForTimeout(2500);
  const hasDelete = await page.getByRole("button", { name: "Delete" }).count();
  log.push("detail Delete button (admin): " + (hasDelete > 0));
  const bodyText = await page.locator (("text=Color")).count();
  log.push("detail Color row: " + (bodyText > 0));
} catch (e) { log.push("ERROR: " + e.message.slice(0,200)); }
console.log(JSON.stringify(log, null, 2));
await b.close();
