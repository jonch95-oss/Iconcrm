"use client";

import * as React from "react";

type Section = { id: string; title: string; keywords: string; body: React.ReactNode };

const UPDATED = "August 2026";

function Tip({ kind = "tip", children }: { kind?: "tip" | "warn" | "click"; children: React.ReactNode }) {
  const c =
    kind === "warn"
      ? "border-l-4 border-amber-500 bg-amber-50"
      : kind === "click"
        ? "border-l-4 border-[var(--bronze,#b08948)] bg-[#f7f1e6]"
        : "border-l-4 border-emerald-600 bg-emerald-50";
  return <div className={`my-3 rounded-md ${c} px-4 py-3 text-sm`}>{children}</div>;
}
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="my-3 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bronze,#8a6d3b)] text-[11px] font-bold text-white">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}
const B = ({ children }: { children: React.ReactNode }) => <span className="font-semibold">{children}</span>;

const SECTIONS: Section[] = [
  {
    id: "intro", title: "1. Getting around",
    keywords: "navigation sidebar menu roles admin member viewer",
    body: (
      <>
        <p>The left sidebar is your menu: <B>Samples</B>, <B>Order Forms</B>, <B>PIs</B>, <B>POs</B>, <B>Customer POs</B>, <B>Packing Lists</B>, <B>Shipments</B>, <B>Receive</B>, and (admins) <B>Settings</B>. Most work starts on <B>Samples</B>.</p>
        <Tip kind="click"><B>Roles.</B> <B>Admin</B> can do everything incl. Settings &amp; Suggested Groups. <B>Can edit</B> creates/edits samples, groups, order forms. <B>Viewer</B> is read-only.</Tip>
      </>
    ),
  },
  {
    id: "samples", title: "2. The Samples page",
    keywords: "samples table filter sort color filter expand tree chevron sku count",
    body: (
      <>
        <p>Every sample is one row. Filters run across the top; click a column header to sort.</p>
        <h3 className="mt-4 font-semibold">Filters</h3>
        <ul className="ml-5 list-disc space-y-1">
          <li><B>Search</B> matches sample #, style name, etc.</li>
          <li><B>Status, Factory, Brand, Color, Season, Category</B> dropdowns narrow the list. The <B>Color</B> filter matches a sample&apos;s own color <em>or</em> any of its color SKUs.</li>
          <li><B>Overdue</B> shows samples past ETA that aren&apos;t received.</li>
        </ul>
        <h3 className="mt-4 font-semibold">Expand a family (color tree)</h3>
        <p>Click the <B>chevron (›)</B> at the start of a row to reveal its color children — each color&apos;s <B>SKU number</B>, <B>status</B>, editable <B>ETA</B>, <B>Received</B> toggle, and <B>Request revisions</B> button.</p>
      </>
    ),
  },
  {
    id: "statuses", title: "3. Statuses & ETAs",
    keywords: "status eta set requested received quoted on hold revisions produced without sample approved by image dropped x1 revision badge",
    body: (
      <>
        <table className="my-3 w-full border-collapse text-sm">
          <tbody>
            {[
              ["Sample Requested", "Requested, no ETA yet."],
              ["ETA Set", "An ETA date is on it (setting an ETA bumps it here automatically)."],
              ["Sample Received", "The physical sample arrived."],
              ["Quoted (FOB)", "A FOB cost was entered."],
              ["On Hold", "Paused by hand; won't auto-advance."],
              ["Revisions Requested", "You asked the factory for changes."],
              ["Produced without Sample", "Went to production with no sample — sets ETA to 100 days out automatically."],
              ["Approved by Image", "Approved from a photo — ETA unchanged."],
              ["Dropped", "Cancelled (needs a reason)."],
            ].map(([a, b]) => (
              <tr key={a}><td className="border border-[var(--border)] px-3 py-1.5 font-semibold">{a}</td><td className="border border-[var(--border)] px-3 py-1.5">{b}</td></tr>
            ))}
          </tbody>
        </table>
        <Tip kind="click"><B>Where to set status.</B> The inline table dropdown is limited to <B>Sample Requested</B> / <B>On Hold</B> so nothing is set by accident. For the full list, open the sample and click <B>Edit</B>.</Tip>
        <Tip><B>×1</B> next to an ETA = the ETA has been revised once (×2 = twice…).</Tip>
      </>
    ),
  },
  {
    id: "editing", title: "4. Editing a sample",
    keywords: "edit inline material brand category season factory eta received fob request revisions",
    body: (
      <>
        <p><B>Inline (in the table):</B> click a Brand/Category/Season/Factory/Status chip to pick from the dropdown; click the ETA/Received/FOB cell to type.</p>
        <Steps items={[
          <>Click the sample # to open its detail page.</>,
          <>Click <B>Edit</B> (top right) to change any field — incl. <B>Material</B>, the full status list, and a dropped reason.</>,
          <><B>Request revisions</B> (top right) marks the whole sample; for one color, use the Request-revisions button on that color instead.</>,
        ]} />
      </>
    ),
  },
  {
    id: "colors", title: "5. Colors, SKUs & per-color details",
    keywords: "sku color code fill auto generate bulk add per color image upc eta received image upload comments",
    body: (
      <>
        <p>A SKU is a color of a sample: <code>sample # (letters/numbers only) + color code</code>, uppercased — e.g. <code>PA-BEAR-10001</code> + Black (<code>BLK</code>) → <code>PABEAR10001BLK</code>.</p>
        <h3 className="mt-4 font-semibold">Add colors &amp; fill SKUs</h3>
        <Steps items={[
          <>Open the sample → <B>Bulk add SKUs by color</B>: type the size(s) once and one color per line → <B>Add SKUs</B>.</>,
          <>Click <B>Fill SKU codes</B> to fill every color — it uses your saved color codes and <B>auto-generates</B> a code for any color without one (Ombre Gold → <code>OG</code>), telling you which it created so you can rename them in Settings.</>,
        ]} />
        <h3 className="mt-4 font-semibold">Per-color, in the SKU grid</h3>
        <ul className="ml-5 list-disc space-y-1">
          <li><B>Image</B> — click the image cell to upload that color&apos;s photo.</li>
          <li><B>UPC / SKU code / Size</B> — click the cell to edit.</li>
          <li><B>Sample ETA</B> &amp; <B>Received</B> — track each color separately.</li>
          <li><B>Comments</B> — the speech-bubble button opens comments for just that color (with images).</li>
        </ul>
      </>
    ),
  },
  {
    id: "grouping", title: "6. Grouping into families",
    keywords: "group into master merge per color samples material color callout suggestions duplicate",
    body: (
      <>
        <p>Merge separate per-color samples (e.g. <code>PA BCLW-2 A…F</code>) into one master with a color SKU each.</p>
        <Steps items={[
          <>On Samples, tick each sample to combine (2+).</>,
          <>In the blue bar, click <B>Group into master</B>.</>,
          <>Confirm the <B>Master sample number</B> (defaults to the shared part).</>,
          <>The dialog warns on <B>mixed materials / duplicate colors</B> and <B>suggests other samples</B> that share the base &amp; material — tick any to add.</>,
          <>Click <B>Group</B> — each becomes a color SKU (carrying image, received, ETA); originals are removed.</>,
        ]} />
        <Tip kind="warn"><B>Heads up.</B> Grouping deletes the sources. If one is on an order form/PI it&apos;s blocked — unlink first. Available to all editors, not just admins.</Tip>
      </>
    ),
  },
  {
    id: "suggested", title: "7. Suggested groups (admin)",
    keywords: "suggested groups admin cluster material split edit color material not a group duplicate delete",
    body: (
      <>
        <p>Admins get a <B>Suggested groups</B> button on the Samples header. It clusters look-alike sample numbers into candidate families, <B>split by material</B>.</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Editable <B>color</B> and <B>material</B> per member — fix a typo and it re-clusters.</li>
          <li><B>Duplicate colors</B> flagged in orange; trash icon deletes a true duplicate.</li>
          <li>Set the <B>Master #</B> and <B>Group</B>, or click <B>Not a group</B> to stop it being suggested.</li>
        </ul>
      </>
    ),
  },
  {
    id: "comments", title: "8. Comments & photos",
    keywords: "comments image photo per color export",
    body: (
      <>
        <p><B>Sample-level:</B> open a sample → <B>Comments</B> tab → type a note, optionally <B>Attach image</B>, → <B>Comment</B>.</p>
        <p><B>Per-color:</B> in the SKU grid, click the <B>speech-bubble</B> on a color to add/read comments for that color only.</p>
        <Tip>The <B>Comments</B> button on the Samples toolbar exports an Excel with paired <em>Comment N Image</em> / <em>Comment N</em> columns per sample.</Tip>
      </>
    ),
  },
  {
    id: "import", title: "9. Importing from Excel",
    keywords: "import template download grouped skus master sample number per color image transparent png size",
    body: (
      <>
        <Steps items={[
          <>Samples → <B>Import</B> → <B>Download template</B> (Brand/Category/Season have dropdowns).</>,
          <>Fill it in; paste each photo into column <B>A</B> on its row.</>,
          <>Drag the file onto the import box. Columns are matched loosely.</>,
        ]} />
        <h3 className="mt-4 font-semibold">Grouped SKUs on upload</h3>
        <p>Put <B>one color per row</B> and either repeat the same <B>Sample #</B>, or give each row its own Sample # plus a shared <B>Master Sample #</B>. Both build one master family with a color SKU each; the photo in column A becomes that color&apos;s image.</p>
        <Tip>Transparent PNGs stay transparent; other photos go on white (never black). Files up to ~250&nbsp;MB. For bulk edits use the <B>data-only</B> export.</Tip>
      </>
    ),
  },
  {
    id: "export", title: "10. Exporting to Excel",
    keywords: "export excel data only comments csv color eta photos",
    body: (
      <>
        <p>On the Samples toolbar (tick rows first, or none for all):</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><B>Export Excel</B> — full, with each color&apos;s photo embedded, Color ETA + Comments columns. Round-trips into the importer.</li>
          <li><B>Export (data only)</B> — same columns, no photos; tiny and fast to re-import.</li>
          <li><B>Comments</B> — comments-with-images export.</li>
          <li><B>CSV</B> — the visible columns.</li>
        </ul>
      </>
    ),
  },
  {
    id: "orderforms", title: "11. Order forms",
    keywords: "order form create documents versions change history notes export xlsx pdf sku number delete revert",
    body: (
      <>
        <p><B>Create:</B> tick samples/SKUs on Samples → <B>Create order form</B> in the bar (they move to On Order Form).</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><B>Export XLSX / PDF</B> — production template; the STYLE column shows each line&apos;s <B>SKU number</B> and the color&apos;s image (fitted, not stretched).</li>
          <li><B>Documents</B> — upload the file; each upload is kept as a version with who/when.</li>
          <li><B>Change history</B> — every quantity/line/status change, upload and note is logged with the person; add notes there.</li>
        </ul>
        <Tip>Deleting an order form (or removing a line) reverts its samples to their real status.</Tip>
      </>
    ),
  },
  {
    id: "shipments", title: "12. Shipments & Bills of Lading",
    keywords: "shipment bill of lading bl container vessel eta confirm upload pdf",
    body: (
      <Steps items={[
        <>Shipments → <B>Add from BL</B>.</>,
        <>Upload the BL PDF — it reads container #, vessel, ports, ETA where it can.</>,
        <>Check/fix the <B>confirm screen</B> (scans may need manual entry) → <B>Create shipment</B>. The BL is attached.</>,
      ]} />
    ),
  },
  {
    id: "settings", title: "13. Settings (admin)",
    keywords: "settings brands color codes hts users roles",
    body: (
      <ul className="ml-5 list-disc space-y-1">
        <li><B>General → Allowed brands</B> — drives every Brand dropdown &amp; import (one per line).</li>
        <li><B>Color Codes</B> — color → code map for SKUs (Black → BLK); Export/Import as Excel.</li>
        <li><B>HTS Codes</B> — category + material → HTS &amp; duty; auto-fills samples.</li>
        <li><B>Users &amp; Roles</B> — Admin / Can edit / Viewer.</li>
      </ul>
    ),
  },
  {
    id: "faq", title: "14. FAQ",
    keywords: "faq sku blank black background too large group blocked color track x1 members not a group per color comments material",
    body: (
      <div className="space-y-2">
        {[
          ["A sample has an ETA but says \"Sample Requested\".", "That's fixed — a sample with an ETA now reads \"ETA Set\" (existing ones corrected automatically). Refresh after the latest deploy."],
          ["The SKU CODE column is blank.", "Open the sample → Fill SKU codes. It fills every color and auto-generates a code for any color without one."],
          ["How do I track just one color?", "Expand the sample on Samples, or use its SKU grid — each color has its own status, ETA, received, image and comments."],
          ["Combine two samples that are the same style?", "Tick them and Group into master. Admins can also use Suggested groups."],
          ["\"Mixed materials\" warning when grouping.", "The picked samples have different materials — a family is usually one material, so double-check or split."],
          ["Grouping is blocked.", "That sample is on an order form or PI — unlink it first."],
          ["Import photos came out black.", "Fixed — transparent PNGs stay transparent, others go on white. Re-import to regenerate old ones."],
          ["Import file too large.", "Up to ~250 MB is accepted; use Export (data only) for bulk edits."],
          ["What is \"×1\" by an ETA?", "The number of times that ETA has been revised."],
          ["Can members group samples?", "Yes — anyone with Can edit. Only Suggested groups is admin-only."],
          ["Add a comment to just one color?", "In the SKU grid, click the speech-bubble on that color."],
        ].map(([q, a]) => (
          <details key={q} className="rounded-lg border border-[var(--border)] px-4 py-1">
            <summary className="cursor-pointer py-2 font-semibold">{q}</summary>
            <p className="pb-2 text-sm">{a}</p>
          </details>
        ))}
      </div>
    ),
  },
];

export default function HelpPage() {
  const [q, setQ] = React.useState("");
  const ql = q.trim().toLowerCase();
  const match = (s: Section) => !ql || (s.title + " " + s.keywords).toLowerCase().includes(ql);
  const visible = SECTIONS.filter(match);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Help &amp; Guide</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Click-by-click reference for the sample &amp; order workflow · updated {UPDATED}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)] lg:overflow-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the guide…"
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <nav className="space-y-0.5 text-sm">
            {visible.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 hover:bg-[var(--accent)]">{s.title}</a>
            ))}
            {visible.length === 0 && <p className="px-2 text-[var(--muted-foreground)]">No matches.</p>}
          </nav>
        </aside>
        <main className="max-w-3xl space-y-8">
          {visible.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-4">
              <h2 className="mb-2 border-t border-[var(--border)] pt-4 text-xl font-semibold">{s.title}</h2>
              <div className="space-y-1 leading-relaxed">{s.body}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
