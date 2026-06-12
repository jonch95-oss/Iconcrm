import { chromium } from "@playwright/test";
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1380, height: 900 } });
page.setDefaultTimeout(90000);
// 1) empty DB: a NON-owner email must be rejected
await page.goto("http://localhost:3000/login", { timeout: 90000 });
await page.locator('#email').fill("random@iconluxurygroup.com");
await page.locator('#password').fill("Icon@1234");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(3000);
console.log("non-owner rejected on empty DB:", (await page.locator("text=That didn't work").count()) > 0);
// 2) owner signs in -> created as admin
await page.locator('#email').fill("jonc@iconluxurygroup.com");
await page.locator('#password').fill("Icon@1234");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("http://localhost:3000/", { timeout: 90000 });
console.log("OWNER LOGIN OK");
await b.close();
