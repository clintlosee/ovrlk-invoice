import { Resend } from "resend";
import { isProduction } from "./config";

type CapturedEmail = { to: string; code: string };

const inbox: CapturedEmail[] = [];

export function takeEmails(): CapturedEmail[] {
  return inbox.splice(0, inbox.length);
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (process.env.VITEST === "1" || !apiKey) {
    inbox.push({ to, code });
    if (process.env.VITEST !== "1" && !isProduction()) {
      console.info(`Sign-in code for ${to}: ${code}`);
    }
    if (isProduction() && !apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Your ovrlk-invoice sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
  });
  if (error) throw new Error("Could not send the sign-in code");
}
