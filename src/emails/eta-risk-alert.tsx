import * as React from "react";
import { Button, Text } from "@react-email/components";
import { EmailLayout, textStyle, buttonStyle } from "./layout";

export interface RiskRow {
  customerPoNumber: string;
  customerName: string;
  window: string;
  status: string;
  bad: boolean;
}

export function EtaRiskAlertEmail({
  shipmentRef,
  containerNumber,
  oldEta,
  newEta,
  slipDays,
  projectedDelivery,
  rows,
  shipmentUrl,
}: {
  shipmentRef: string;
  containerNumber?: string | null;
  oldEta: string | null;
  newEta: string;
  slipDays: number | null;
  projectedDelivery: string;
  rows: RiskRow[];
  shipmentUrl: string;
}) {
  const slip =
    slipDays === null ? "" : slipDays === 0 ? " (on plan)" : slipDays > 0 ? ` (+${slipDays}d vs original)` : ` (${slipDays}d vs original)`;
  return (
    <EmailLayout
      preview={`Shipment ${shipmentRef} ETA update`}
      heading={`Shipment ${shipmentRef}: ETA update`}
    >
      <Text style={textStyle}>
        {containerNumber ? `Container ${containerNumber}. ` : ""}
        {oldEta ? `ETA moved from ${oldEta} to ${newEta}${slip}.` : `ETA is now ${newEta}${slip}.`}{" "}
        Projected delivery to the customer DC: <strong>{projectedDelivery}</strong>.
      </Text>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={cell}>Customer PO</th>
            <th style={cell}>Customer</th>
            <th style={cell}>Window (start – cancel)</th>
            <th style={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.customerPoNumber}>
              <td style={cell}>{r.customerPoNumber}</td>
              <td style={cell}>{r.customerName}</td>
              <td style={cell}>{r.window}</td>
              <td style={{ ...cell, color: r.bad ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button href={shipmentUrl} style={buttonStyle}>
        Open shipment
      </Button>
    </EmailLayout>
  );
}

const cell: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: "6px 8px",
  textAlign: "left",
};
