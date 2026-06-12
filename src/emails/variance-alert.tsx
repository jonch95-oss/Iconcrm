import * as React from "react";
import { Button, Text } from "@react-email/components";
import { EmailLayout, textStyle, buttonStyle } from "./layout";

export interface VarianceRow {
  label: string;
  fob: string;
  unitPrice: string;
  variance: string;
}

export function VarianceAlertEmail({
  piNumber,
  factoryName,
  rows,
  piUrl,
  digest,
}: {
  piNumber: string;
  factoryName?: string | null;
  rows: VarianceRow[];
  piUrl: string;
  digest?: boolean;
}) {
  return (
    <EmailLayout
      preview={`FOB variance on PI ${piNumber}`}
      heading={digest ? "Daily FOB variance digest" : `FOB variance: PI ${piNumber}`}
    >
      <Text style={textStyle}>
        {digest
          ? "The following PI lines have unresolved FOB variances against the recorded sample FOB cost:"
          : `PI ${piNumber}${factoryName ? ` (${factoryName})` : ""} has lines whose unit price differs from the recorded FOB cost:`}
      </Text>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={cell}>Line</th>
            <th style={cell}>FOB</th>
            <th style={cell}>Unit price</th>
            <th style={cell}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={cell}>{r.label}</td>
              <td style={cell}>{r.fob}</td>
              <td style={cell}>{r.unitPrice}</td>
              <td style={{ ...cell, color: "#dc2626", fontWeight: 700 }}>{r.variance}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button href={piUrl} style={{ ...buttonStyle, marginTop: "16px" }}>
        Review & resolve
      </Button>
    </EmailLayout>
  );
}

const cell: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  padding: "6px 8px",
  textAlign: "left",
};

export default VarianceAlertEmail;
