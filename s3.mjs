import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await b.newPage();
page.setDefaultTimeout(60000);
const errs = [];
page.on("pageerror", e => errs.push("PAGEERR: " + e.message.slice(0,150)));
page.on("response", r => { if (r.status() >= 500) errs.push("HTTP "+r.status()+" "+r.url().replace("http://localhost:3000","")); });
try {
  await page.goto("http://localhost:3000/login");
  await page.locator('#email').fill("jonc@iconluxurygroup.com");
  await page.locator('#password').fill("Icon@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://localhost:3000/", { timeout: 60000 });
  await page.goto("http://localhost:3000/samples");
  await page.waitForLoadState("networkidle");
  const href = await page.locator('table tbody tr td a').first().getAttribute("href");
  await page.goto("http://localhost:3000" + href);
  await page.waitForTimeout(2500);
  const title = await page.locator (("h1")).first().textContent().catch(()=>"(none)");
  errs.push("detail h1: " + title);
  errs.push("buttons on page: " + JSON.stringify(await page.locator("button").allTextContents()));
} catch(e){ errs.push("ERR "+e.message.slice(0,150)); }
console.log(JSON.stringify(errs,null,2));
await b.close();
