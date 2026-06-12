import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

const main = { backgroundColor: "#f4f4f5", fontFamily: "Arial, sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
  borderRadius: "8px",
};
const footer = { color: "#71717a", fontSize: "12px", marginTop: "16px" };

export function EmailLayout({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h2" style={{ color: "#18181b", fontSize: "20px" }}>
            {heading}
          </Heading>
          <Section>{children}</Section>
          <Hr />
          <Text style={footer}>
            Sample-to-PO CRM · Wholesale Production Tracker. This is an automated
            message.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const textStyle = { color: "#27272a", fontSize: "14px", lineHeight: "22px" };
export const buttonStyle = {
  backgroundColor: "#18181b",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  textDecoration: "none",
  padding: "10px 18px",
  display: "inline-block",
};
