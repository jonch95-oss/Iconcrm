import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "ops@example.com";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

/**
 * Send a transactional email via Resend. When no API key is configured (local
 * dev), the rendered email is logged to the console instead of sent, so the
 * flows remain exercisable without external credentials.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string }> {
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const recipients = to.filter(Boolean);
  if (recipients.length === 0) return { ok: false };

  if (!resend) {
    const html = await render(input.react);
    console.log(
      `[email:dev] To=${recipients.join(",")} Subject="${input.subject}"\n${html.slice(0, 400)}...`,
    );
    return { ok: true, id: "dev-noop" };
  }

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: recipients,
    subject: input.subject,
    react: input.react,
    replyTo: input.replyTo,
  });
  if (error) {
    console.error("[email] send failed", error);
    return { ok: false };
  }
  return { ok: true, id: data?.id };
}
