import * as React from "react";
import { Button, Text } from "@react-email/components";
import { EmailLayout, textStyle, buttonStyle } from "./layout";

export function SampleFollowUpEmail({
  sampleNumber,
  styleName,
  factoryName,
  sampleUrl,
  snoozeUrl,
  stopUrl,
}: {
  sampleNumber: string;
  styleName?: string | null;
  factoryName?: string | null;
  sampleUrl: string;
  snoozeUrl: string;
  stopUrl: string;
}) {
  return (
    <EmailLayout
      preview={`Follow-up: where is sample ${sampleNumber}?`}
      heading={`Sample follow-up: ${sampleNumber}`}
    >
      <Text style={textStyle}>
        We&apos;re still waiting on sample <strong>{sampleNumber}</strong>
        {styleName ? ` (${styleName})` : ""}
        {factoryName ? ` from ${factoryName}` : ""}. Could you share an updated
        status or ETA?
      </Text>
      <Button href={sampleUrl} style={buttonStyle}>
        View sample
      </Button>
      <Text style={{ ...textStyle, marginTop: "16px" }}>
        <a href={snoozeUrl}>Snooze 7 days</a> ·{" "}
        <a href={stopUrl}>Stop follow-ups</a>
      </Text>
    </EmailLayout>
  );
}

export default SampleFollowUpEmail;
