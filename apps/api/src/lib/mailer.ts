import nodemailer, { type Transporter } from 'nodemailer';

const FROM = process.env.MAIL_FROM ?? 'OPT Systems <info@optsystemsltd.com>';

// Built lazily (not at import time) so missing SMTP config never breaks server
// boot — it only matters when an email actually needs sending.
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export interface InviteEmailInput {
  to: string;
  contactName: string;
  org: string;
  acceptUrl: string;
}

/**
 * Sends the "set up your login" email for a freshly created organisation. If
 * SMTP isn't configured (e.g. local dev), logs the invite link instead of
 * throwing — org creation itself should never fail for lack of mail config.
 */
export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const subject = `Set up your OPT Systems login for ${input.org}`;
  const text =
    `Hi ${input.contactName},\n\n` +
    `${input.org} has just been set up on OPT Systems. Follow the link below to create your password and sign in:\n\n` +
    `${input.acceptUrl}\n\n` +
    `This link expires in 7 days.\n\n` +
    `— OPT Systems\n${FROM}`;

  const t = getTransporter();
  if (!t) {
    console.warn(`[mailer] SMTP not configured — invite link for ${input.to}: ${input.acceptUrl}`);
    return;
  }
  await t.sendMail({ from: FROM, to: input.to, subject, text });
}
