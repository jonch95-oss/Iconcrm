"use client";

import * as React from "react";

const CSS = `.helpdoc{--bg:#faf9f7;--panel:#fff;--ink:#1c1a17;--muted:#6b6459;--line:#e7e2d9;--accent:#8a6d3b;--accent2:#b08948;--warn:#b7791f;--ok:#2f855a;--bad:#c53030;}
.helpdoc *{box-sizing:border-box}
.helpdoc{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.helpdoc a{color:var(--accent);text-decoration:none}
.helpdoc a:hover{text-decoration:underline}
.helpdoc .wrap{display:grid;grid-template-columns:260px 1fr;gap:0}
.helpdoc nav{position:sticky;top:0;align-self:start;height:calc(100vh - 32px);overflow:auto;padding:24px 18px;border-right:1px solid var(--line);background:var(--panel)}
.helpdoc nav h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 0 8px}
.helpdoc nav a{display:block;padding:4px 8px;border-radius:6px;color:var(--ink);font-size:14px}
.helpdoc nav a:hover{background:#f1ece2;text-decoration:none}
.helpdoc nav .brand{font-weight:800;font-size:20px;color:var(--accent);margin-bottom:2px}
.helpdoc nav .sub{font-size:12px;color:var(--muted);margin-bottom:8px}
.helpdoc #search{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;margin:6px 0 4px;font-size:14px}
.helpdoc main{padding:20px 32px;max-width:880px}
.helpdoc h1{font-size:30px;margin:0 0 6px}
.helpdoc h2.sec{font-size:23px;margin:38px 0 10px;padding-top:14px;border-top:2px solid var(--line)}
.helpdoc h3{font-size:18px;margin:22px 0 6px}
.helpdoc p, .helpdoc li{color:#33302b}
.helpdoc code, .helpdoc kbd{background:#f1ece2;border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:.9em}
.helpdoc kbd{font-weight:600}
.helpdoc .tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--line)}
.helpdoc .steps{counter-reset:s;padding-left:0;list-style:none}
.helpdoc .steps li{counter-increment:s;position:relative;padding:6px 0 6px 34px}
.helpdoc .steps li:before{content:counter(s);position:absolute;left:0;top:6px;width:22px;height:22px;background:var(--accent);color:#fff;border-radius:50%;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.helpdoc .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:14px 0}
.helpdoc .tip{border-left:4px solid var(--ok);background:#f0f7f2}
.helpdoc .warn{border-left:4px solid var(--warn);background:#fbf4e6}
.helpdoc .click{border-left:4px solid var(--accent2);background:#f7f1e6}
.helpdoc table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
.helpdoc th, .helpdoc td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
.helpdoc th{background:#f1ece2}
.helpdoc .faq details{border:1px solid var(--line);border-radius:10px;padding:2px 14px;margin:8px 0;background:var(--panel)}
.helpdoc .faq summary{cursor:pointer;font-weight:600;padding:10px 0}
.helpdoc .path{font-size:13px;color:var(--muted)}
.helpdoc .path b{color:var(--accent)}
.helpdoc footer{color:var(--muted);font-size:13px;margin-top:40px;border-top:1px solid var(--line);padding-top:14px}
.helpdoc .hide{display:none!important}`;

const BODY = `
<nav>
  <div class="brand">Icon CRM</div>
  <div class="sub">Team User Guide</div>
  <input id="search" placeholder="Search the guide…" />
  <h2>Contents</h2>
  <a href="#intro">1. Getting around</a>
  <a href="#samples">2. The Samples page</a>
  <a href="#statuses">3. Statuses &amp; ETAs</a>
  <a href="#editing">4. Editing a sample</a>
  <a href="#colors">5. Colors &amp; SKUs</a>
  <a href="#grouping">6. Grouping into families</a>
  <a href="#suggested">7. Suggested groups (admin)</a>
  <a href="#comments">8. Comments &amp; photos</a>
  <a href="#import">9. Importing from Excel</a>
  <a href="#export">10. Exporting to Excel</a>
  <a href="#orderforms">11. Order forms</a>
  <a href="#shipments">12. Shipments &amp; Bills of Lading</a>
  <a href="#settings">13. Settings (admin)</a>
  <a href="#faq">14. FAQ</a>
</nav>
<main>
  <h1>Icon CRM — Team User Guide</h1>
  <p class="path">A practical, click-by-click reference for the sample &amp; order workflow. Use the search box on the left to jump to a topic.</p>

  <h2 class="sec" id="intro">1. Getting around</h2>
  <p>The left sidebar in the app is your main menu: <b>Samples</b>, <b>Order Forms</b>, <b>PIs</b>, <b>POs</b>, <b>Customer POs</b>, <b>Packing Lists</b>, <b>Shipments</b>, <b>Receive</b>, and (for admins) <b>Settings</b>. Most day-to-day work starts on <b>Samples</b>.</p>
  <div class="card click"><b>Roles.</b> <span class="tag">Admin</span> can do everything, including Settings and the Suggested Groups page. <span class="tag">Can edit</span> (member) can create/edit samples, group, and manage order forms. <span class="tag">Viewer</span> can look but not change.</div>

  <h2 class="sec" id="samples">2. The Samples page</h2>
  <p>Every sample is one row. Across the top are <b>filters</b>; each column header can be clicked to <b>sort</b>.</p>
  <h3>Filters (top of the table)</h3>
  <ul>
    <li><b>Search</b> box — matches sample #, style name, etc.</li>
    <li><b>Status</b>, <b>Factory</b>, <b>Brand</b>, <b>Color</b>, <b>Season</b>, <b>Category</b> dropdowns — pick one to narrow the list. The <b>Color</b> filter matches a sample's own color <em>or</em> any of its color SKUs, so you can pull "everything in Ombre Gold".</li>
    <li><b>Overdue</b> toggle — samples past their ETA that haven't been received.</li>
  </ul>
  <h3>The expand arrow (color family tree)</h3>
  <p>Click the <b>chevron (›)</b> at the start of a row to expand it. You'll see the master's <b>color children</b> — each color's <b>SKU number</b>, its <b>status</b>, an editable <b>Sample ETA</b>, a <b>Received</b> checkbox, and a <b>Request revisions</b> button. This is how you track each color separately under one master.</p>
  <div class="card tip"><b>Tip.</b> The <b>SKUS</b> column shows how many color SKUs a sample has. If it's 0, the sample has no colors yet — add them from the sample's detail page.</div>

  <h2 class="sec" id="statuses">3. Statuses &amp; ETAs</h2>
  <p>Status reflects where a sample is in the pipeline. Some are set automatically; some you set by hand.</p>
  <table>
    <tr><th>Status</th><th>What it means</th></tr>
    <tr><td>Sample Requested</td><td>Requested, no ETA on it yet.</td></tr>
    <tr><td>ETA Set</td><td>An expected-arrival date is on the sample (setting an ETA bumps it here automatically).</td></tr>
    <tr><td>Sample Received</td><td>The physical sample arrived (marking Received sets this).</td></tr>
    <tr><td>Quoted (FOB)</td><td>A FOB cost has been entered.</td></tr>
    <tr><td>On Order Form → PI → PO → Shipped → Closed</td><td>Later production stages.</td></tr>
    <tr><td>On Hold</td><td>Paused. Set by hand; won't auto-advance.</td></tr>
    <tr><td>Revisions Requested</td><td>You asked the factory for changes.</td></tr>
    <tr><td>Produced without Sample</td><td>Went to production with no physical sample. <b>Sets the ETA to 100 days out automatically.</b></td></tr>
    <tr><td>Approved by Image</td><td>Approved from a photo — <b>ETA is left unchanged.</b></td></tr>
    <tr><td>Dropped</td><td>Cancelled (needs a reason).</td></tr>
  </table>
  <div class="card click"><b>Where to set status.</b> In the table, the inline <b>Status</b> dropdown is deliberately limited to <b>Sample Requested</b> and <b>On Hold</b> so nobody sets a wrong stage by accident. For the full list (Produced without Sample, Approved by Image, Dropped, etc.), open the sample and use <b>Edit</b>.</div>
  <div class="card tip"><b>×1 badge next to an ETA</b> = the ETA has been revised once (×2 = twice…). It flags dates that keep slipping.</div>

  <h2 class="sec" id="editing">4. Editing a sample</h2>
  <h3>Quick inline edits (right in the table)</h3>
  <ul>
    <li><b>Brand, Category, Season, Factory, Status</b> — click the chip/cell and pick from the dropdown.</li>
    <li><b>ETA, Received, FOB</b> — click the cell to type/pick a value.</li>
  </ul>
  <h3>Full edit</h3>
  <ol class="steps">
    <li>Click the sample # to open its detail page.</li>
    <li>Click <b>Edit</b> (top right) to change any field, including the full status list and a dropped reason.</li>
    <li><b>Request revisions</b> (top right) marks the whole sample as Revisions Requested. To do it for a single color instead, use the <b>Request revisions</b> button on that color in the family tree or SKU grid.</li>
  </ol>

  <h2 class="sec" id="colors">5. Colors &amp; SKUs</h2>
  <p>A SKU is a specific color of a sample. SKUs are built as <code>sample # (letters/numbers only) + color code</code>, uppercased — e.g. <code>PA-BEAR-10001</code> + Black (<code>BLK</code>) → <code>PABEAR10001BLK</code>.</p>
  <h3>Add colors in bulk</h3>
  <ol class="steps">
    <li>Open the sample. In <b>Bulk add SKUs by color</b>, type the size(s) once and one color per line.</li>
    <li>Click <b>Add SKUs</b>. A SKU is auto-built for each color that has a code.</li>
  </ol>
  <h3>Fill / auto-generate SKU codes</h3>
  <p>Click <b>Fill SKU codes</b> on the SKU grid. It fills every color's SKU — using your saved color codes, and <b>auto-generating a code for any color that doesn't have one yet</b> (e.g. Ombre Gold → <code>OG</code>, Purple → <code>PUR</code>). Auto-generated codes are saved to your editable map; it tells you which it created so you can rename them in Settings.</p>
  <h3>Per-color tracking</h3>
  <p>In the SKU grid (and the family tree on the Samples page) each color has its own <b>image</b>, <b>Sample ETA</b>, <b>Received</b> checkbox, and <b>SKU code</b> — so you can track each colorway independently.</p>

  <h2 class="sec" id="grouping">6. Grouping into families</h2>
  <p>If the same style was entered as separate per-color samples (e.g. <code>PA BCLW-2 A…F</code>), you can merge them into one master with a color SKU each.</p>
  <ol class="steps">
    <li>On the Samples page, tick the checkbox on each sample you want to combine (2 or more).</li>
    <li>In the blue selection bar, click <b>Group into master</b>.</li>
    <li>Confirm/adjust the <b>Master sample number</b> (it defaults to the shared part of the names).</li>
    <li>The dialog <b>warns about mixed materials and duplicate colors</b>, and <b>suggests other samples</b> that share the same base &amp; material — tick any to add them.</li>
    <li>Click <b>Group</b>. Each becomes a color SKU (carrying its image, received date and ETA); the originals are removed.</li>
  </ol>
  <div class="card warn"><b>Heads up.</b> Grouping deletes the source rows after merging. If one is already on an order form or PI, the group is blocked with a message — unlink it first. For clean SKUs, make sure each color has a code (or hit <b>Fill SKU codes</b> after).</div>

  <h2 class="sec" id="suggested">7. Suggested groups (admin only)</h2>
  <p>Admins get a <b>Suggested groups</b> button on the Samples header. It scans the whole catalog and clusters look-alike sample numbers into candidate families, <b>split by material</b> (a style in Leather vs Nylon becomes separate families).</p>
  <ul>
    <li>Each family shows its members with an editable <b>color</b> and <b>material</b> — fix a typo and it re-clusters.</li>
    <li><b>Duplicate colors</b> are flagged in orange. Use the <b>trash</b> icon to delete a true duplicate.</li>
    <li>Set the <b>Master #</b> and click <b>Group</b> — or click <b>Not a group</b> to mark them separate so they stop being suggested.</li>
  </ul>

  <h2 class="sec" id="comments">8. Comments &amp; photos</h2>
  <ol class="steps">
    <li>Open a sample → <b>Comments</b> tab.</li>
    <li>Type a note. Click <b>Attach image</b> to add a reference photo (optional).</li>
    <li>Click <b>Comment</b>. The note and image show in the thread; click the image to open it full-size.</li>
  </ol>
  <div class="card tip"><b>Export comments.</b> On the Samples page toolbar, <b>Comments</b> downloads an Excel with one row per sample and paired columns per comment — <em>Comment 1 Image</em> (the photo, embedded) and <em>Comment 1</em> (the text).</div>

  <h2 class="sec" id="import">9. Importing from Excel</h2>
  <ol class="steps">
    <li>Samples page → <b>Import</b> → <b>Download template</b> to get the correct columns (Brand/Category/Season have dropdowns).</li>
    <li>Fill it in. Paste each product photo into column <b>A</b> on its row.</li>
    <li>Drag the file onto the import box (or click to choose). Column names are matched loosely, so your existing sheets usually work as-is.</li>
  </ol>
  <h3>Making grouped SKUs on upload</h3>
  <p>Put <b>one color per row</b> and either repeat the same <b>Sample #</b> on each row, <em>or</em> give each row its own Sample # plus a shared <b>Master Sample #</b>. Both build one master family with a color SKU each. Paste that color's photo in column A for per-color images.</p>
  <table>
    <tr><th>Sample #</th><th>Master Sample #</th><th>Color</th><th>Result</th></tr>
    <tr><td>OW-BXBW0007 A</td><td>OW-BXBW0007</td><td>Green</td><td rowspan="2">One master <code>OW-BXBW0007</code> with Green + Gold color SKUs</td></tr>
    <tr><td>OW-BXBW0007 B</td><td>OW-BXBW0007</td><td>Ombre Gold</td></tr>
  </table>
  <div class="card tip"><b>Images.</b> Transparent PNGs are kept transparent; other photos are placed on white (never black). Files up to ~250&nbsp;MB are accepted. For big bulk edits, use the <b>data-only</b> export (no photos) — it's tiny and fast to re-import.</div>

  <h2 class="sec" id="export">10. Exporting to Excel</h2>
  <p>On the Samples page toolbar (tick rows first to export just those, or none for everything):</p>
  <ul>
    <li><b>Export Excel</b> — full export with each color's photo embedded, every column, Color ETA and a Comments column. Round-trips back into the importer.</li>
    <li><b>Export (data only)</b> — same columns, no photos. A few hundred KB; ideal for bulk-editing then re-importing.</li>
    <li><b>Comments</b> — the comments-with-images export described above.</li>
    <li><b>CSV</b> — the visible columns as plain CSV.</li>
  </ul>

  <h2 class="sec" id="orderforms">11. Order forms</h2>
  <h3>Create one</h3>
  <ol class="steps">
    <li>On Samples, tick the samples (or specific color SKUs) to include.</li>
    <li>Click <b>Create order form</b> in the selection bar. The samples move to <b>On Order Form</b>.</li>
  </ol>
  <h3>Inside an order form</h3>
  <ul>
    <li>Edit quantities per line; <b>Export XLSX</b> / <b>Export PDF</b> use the production template (the STYLE column shows each line's <b>SKU number</b>, and the image is that color's photo, fitted proportionally).</li>
    <li><b>Order form documents</b> — upload the signed/updated file; each upload is kept as a version (v1, v2…) with who/when.</li>
    <li><b>Change history</b> — every quantity change, line removal, status change, file upload and note is logged with the person. Add a <b>note</b> there for context.</li>
  </ul>
  <div class="card tip"><b>Deleting an order form</b> reverts its samples to what they were before (their real ETA/received/quoted state). Removing a single line does the same for that sample if it's no longer on any order form.</div>

  <h2 class="sec" id="shipments">12. Shipments &amp; Bills of Lading</h2>
  <ol class="steps">
    <li>Shipments page → <b>Add from BL</b>.</li>
    <li>Upload the Bill of Lading PDF. The system reads the container #, vessel, ports and ETA where it can.</li>
    <li>Check/fix the fields on the <b>confirm screen</b> (scanned PDFs may need manual entry), then <b>Create shipment</b>. The BL is attached to the shipment.</li>
  </ol>

  <h2 class="sec" id="settings">13. Settings (admin only)</h2>
  <ul>
    <li><b>General → Allowed brands</b> — the brand list that drives every Brand dropdown and import. One per line.</li>
    <li><b>Color Codes</b> — the color → code map used to build SKUs (e.g. Black → BLK). Missing colors are called out; you can also Export/Import as Excel.</li>
    <li><b>HTS Codes</b> — category + material → HTS &amp; duty. Auto-fills HTS on samples.</li>
    <li><b>Users &amp; Roles</b> — set who's Admin / Can edit / Viewer.</li>
  </ul>

  <h2 class="sec" id="faq">14. FAQ</h2>
  <div class="faq">
    <details><summary>A sample has an ETA but still says "Sample Requested". Why?</summary><p>That was a display gap — a sample with an ETA should read "ETA Set". It's fixed: new imports set it correctly and existing ones are corrected automatically. If you still see it, refresh after the latest update deploys.</p></details>
    <details><summary>The SKU CODE column is blank. How do I fill it?</summary><p>Open the sample and click <b>Fill SKU codes</b>. It fills every color — using your saved color codes and auto-generating one for any color that doesn't have a code yet (it tells you which it created so you can rename them in Settings → Color Codes).</p></details>
    <details><summary>How do I track just one color?</summary><p>Expand the sample (chevron) on the Samples page, or open the sample's SKU grid. Each color has its own status, Sample ETA, Received checkbox and Request-revisions button.</p></details>
    <details><summary>Two samples are really the same style in different colors. How do I combine them?</summary><p>Tick them on the Samples page and click <b>Group into master</b>. Admins can also use the <b>Suggested groups</b> page, which finds these automatically.</p></details>
    <details><summary>The Group button warns about "mixed materials". What does that mean?</summary><p>The samples you picked have different materials (e.g. Leather vs Nylon). A family is usually one material, so double-check — you may want two separate groups. You can fix a material typo right in the Suggested Groups page.</p></details>
    <details><summary>Grouping is blocked / won't delete a sample.</summary><p>That sample is already on an order form or PI. Unlink it there first, then group again — this protects anything already in production.</p></details>
    <details><summary>My import photos came out with a black background.</summary><p>Fixed — transparent PNGs stay transparent and other photos go on white. Re-import the sheet after the update to regenerate any old black images.</p></details>
    <details><summary>My import file is too large to upload.</summary><p>Files up to ~250&nbsp;MB are accepted. Image-heavy exports can be big; for bulk data edits use <b>Export (data only)</b> which has no photos.</p></details>
    <details><summary>What is the "×1" next to an ETA?</summary><p>The number of times that ETA has been revised (×1 = once). It flags dates that keep changing.</p></details>
    <details><summary>Can members (not admins) group samples?</summary><p>Yes — anyone with "Can edit" can select samples and use <b>Group into master</b>. Only the <b>Suggested groups</b> page is admin-only.</p></details>
    <details><summary>I stopped a family from being suggested by mistake.</summary><p>"Not a group" is currently a one-way dismiss. Ask an admin to have it un-marked (a restore toggle can be added).</p></details>
  </div>

  <footer>Icon CRM — Team User Guide. Features and screens may evolve; when in doubt, hover a button to see its tooltip. Generated for the Icon Luxury Group team.</footer>
</main>
`;

export default function HelpPage() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const input = root.querySelector<HTMLInputElement>("#search");
    if (!input) return;
    const handler = () => {
      const q = (input.value || "").trim().toLowerCase();
      root.querySelectorAll("main h2.sec").forEach((h) => {
        const nodes: Element[] = [h];
        let n = h.nextElementSibling;
        while (n && !(n.tagName === "H2" && n.classList.contains("sec"))) { nodes.push(n); n = n.nextElementSibling; }
        const text = nodes.map((x) => x.textContent?.toLowerCase() ?? "").join(" ");
        const show = !q || text.includes(q);
        nodes.forEach((x) => x.classList.toggle("hide", !show));
      });
    };
    input.addEventListener("input", handler);
    return () => input.removeEventListener("input", handler);
  }, []);
  return (
    <div className="helpdoc" ref={ref}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div dangerouslySetInnerHTML={{ __html: BODY }} />
    </div>
  );
}
