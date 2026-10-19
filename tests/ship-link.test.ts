/**
 * Turning a OneDrive share link into something that serves the bytes.
 * Run with: npx tsx tests/ship-link.test.ts
 */
import assert from "node:assert";
import { shareIdDownloadUrl } from "../src/lib/ship-sync";

// The shape the factory's link takes: /:x:/p/<person>/<share id>
assert.equal(
  shareIdDownloadUrl("https://contoso-my.sharepoint.com/:x:/p/moshe/IQBgDwySj6eIRrb7gCcS2jldAbANW3A1EbSftOv9_cKq70g?e=MfyWL4"),
  "https://contoso-my.sharepoint.com/_layouts/15/download.aspx?share=IQBgDwySj6eIRrb7gCcS2jldAbANW3A1EbSftOv9_cKq70g",
);
// A trailing slash is the same link.
assert.equal(
  shareIdDownloadUrl("https://contoso-my.sharepoint.com/:w:/g/personal/x/EXAMPLEID/"),
  "https://contoso-my.sharepoint.com/_layouts/15/download.aspx?share=EXAMPLEID",
);
// Anything else isn't that shape, and the other candidates handle it.
assert.equal(shareIdDownloadUrl("https://1drv.ms/x/s!AbCdEf"), null);
assert.equal(shareIdDownloadUrl("https://contoso.sharepoint.com/sites/team/Shared%20Documents/a.xlsx"), null);

console.log("ship-link: all tests passed");
