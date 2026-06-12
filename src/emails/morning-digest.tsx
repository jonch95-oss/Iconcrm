import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout, textStyle } from "./layout";

export interface DigestSection {
  title: string;
  items: string[];
}

export function MorningDigestEmail({
  name,
  sections,
}: {
  name?: string | null;
  sections: DigestSection[];
}) {
  return (
    <EmailLayout preview="Your morning CRM digest" heading="Morning digest">
      <Text style={textStyle}>Good morning{name ? `, ${name}` : ""}.</Text>
      {sections.map((s) => (
        <div key={s.title} style={{ marginTop: "12px" }}>
          <Text style={{ ...textStyle, fontWeight: 700 }}>
            {s.title} ({s.items.length})
          </Text>
          {s.items.length === 0 ? (
            <Text style={{ ...textStyle, color: "#71717a" }}>Nothing — all clear.</Text>
          ) : (
            <ul>
              {s.items.map((it, i) => (
                <li key={i} style={textStyle}>
                  {it}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </EmailLayout>
  );
}

export default MorningDigestEmail;
