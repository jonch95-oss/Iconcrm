import * as React from "react";
import { Text, Hr } from "@react-email/components";
import { EmailLayout, textStyle } from "./layout";
import { RECAP_ENTRY_LABEL, type RecapSample } from "@/lib/revisions";

const label = { color: "#71717a", fontSize: "12px", margin: "0" };
const head = { color: "#18181b", fontSize: "15px", fontWeight: 700, margin: "0 0 2px" };
const entry = { ...textStyle, margin: "4px 0 0", fontSize: "13px" };

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

/**
 * The recap a factory receives: one block per style with its photo, what was
 * asked for, and what's still outstanding.
 */
export function RevisionRecapEmail({
  factoryName,
  contactName,
  since,
  samples,
  appUrl,
}: {
  factoryName: string;
  contactName: string | null;
  since: Date | null;
  samples: RecapSample[];
  appUrl: string;
}) {
  const open = samples.filter((s) => s.open);
  return (
    <EmailLayout
      preview={`Sample revisions & comments for ${factoryName}`}
      heading={`Sample revisions & comments — ${factoryName}`}
    >
      <Text style={textStyle}>
        {contactName ? `Hi ${contactName},` : "Hi,"} here&apos;s a recap of our notes on{" "}
        {samples.length} style{samples.length === 1 ? "" : "s"}
        {since ? ` since ${day(since)}` : ""}.
        {open.length > 0 && (
          <>
            {" "}
            We&apos;re still waiting on revised samples for <strong>{open.length}</strong> of them.
          </>
        )}
      </Text>

      {samples.map((s) => (
        <React.Fragment key={s.id}>
          <Hr />
          {s.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.imageUrl}
              alt=""
              width="96"
              height="96"
              style={{ objectFit: "contain", border: "1px solid #e4e4e7", borderRadius: "4px", background: "#fff" }}
            />
          )}
          <Text style={head}>
            {s.sampleNumber}
            {s.styleName ? ` · ${s.styleName}` : ""}
          </Text>
          <Text style={label}>
            {[s.brand, s.color, `ETA ${day(s.sampleEta)}`, s.statusLabel].filter(Boolean).join(" · ")}
            {s.open ? ` · AWAITING REVISED SAMPLE${s.openDays != null ? ` (${s.openDays}d)` : ""}` : ""}
            {s.openColors.length ? ` · colors: ${s.openColors.join(", ")}` : ""}
          </Text>
          {s.entries.map((e) => (
            <Text key={e.id} style={entry}>
              <strong>{day(e.at)} · {RECAP_ENTRY_LABEL[e.kind]}</strong>
              {e.color ? ` (${e.color})` : ""}: {e.body}
            </Text>
          ))}
        </React.Fragment>
      ))}

      {appUrl && (
        <>
          <Hr />
          <Text style={{ ...textStyle, fontSize: "12px", color: "#71717a" }}>
            Reply to this email with an updated status or ETA for anything still outstanding.
          </Text>
        </>
      )}
    </EmailLayout>
  );
}

export default RevisionRecapEmail;
