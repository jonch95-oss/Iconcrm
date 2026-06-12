import * as React from "react";
import { Button, Text } from "@react-email/components";
import { EmailLayout, textStyle, buttonStyle } from "./layout";

export function PoNotificationEmail({
  poNumber,
  piNumber,
  factoryName,
  paymentTerms,
  poUrl,
}: {
  poNumber: string;
  piNumber: string;
  factoryName?: string | null;
  paymentTerms?: string | null;
  poUrl: string;
}) {
  return (
    <EmailLayout
      preview={`PO ${poNumber} issued`}
      heading={`Purchase order issued: ${poNumber}`}
    >
      <Text style={textStyle}>
        A purchase order has been issued against PI <strong>{piNumber}</strong>
        {factoryName ? ` (${factoryName})` : ""}.
      </Text>
      <Text style={textStyle}>
        <strong>PO #:</strong> {poNumber}
        <br />
        <strong>PI #:</strong> {piNumber}
        {paymentTerms ? (
          <>
            <br />
            <strong>Payment terms:</strong> {paymentTerms}
          </>
        ) : null}
      </Text>
      <Button href={poUrl} style={buttonStyle}>
        View purchase order
      </Button>
    </EmailLayout>
  );
}

export default PoNotificationEmail;
