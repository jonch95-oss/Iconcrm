import * as React from "react";
import { Button, Text } from "@react-email/components";
import { EmailLayout, textStyle, buttonStyle } from "./layout";

export function MissingInfoEmail({
  sampleNumber,
  missingFields,
  formUrl,
}: {
  sampleNumber: string;
  missingFields: string[];
  formUrl: string;
}) {
  return (
    <EmailLayout
      preview={`Action needed: missing details for sample ${sampleNumber}`}
      heading="We need a few more details"
    >
      <Text style={textStyle}>
        Thanks for your sample request. We logged it as{" "}
        <strong>{sampleNumber}</strong>, but the following fields are missing and
        we need them to proceed:
      </Text>
      <ul>
        {missingFields.map((f) => (
          <li key={f} style={textStyle}>
            {f}
          </li>
        ))}
      </ul>
      <Text style={textStyle}>
        Use the secure link below to fill them in (no login required, expires in
        7 days):
      </Text>
      <Button href={formUrl} style={buttonStyle}>
        Complete sample details
      </Button>
    </EmailLayout>
  );
}

export default MissingInfoEmail;
