// Mailpit helper. Mailpit is the local mail catcher Supabase ships
// with `supabase start` — it exposes an HTTP API for listing and
// fetching messages. We use it in 01-sign-in.spec.ts to fetch the
// magic-link URL Supabase sent during a sign-in attempt, then have
// the browser follow it.

import { env } from './env';

type MailpitMessage = {
  ID: string;
  To: { Address: string; Name: string }[];
  Subject: string;
  Date: string;
};

type MailpitMessageBody = {
  Text: string;
  HTML: string;
};

/**
 * Poll Mailpit for the most recent message sent to `email`. Returns
 * the parsed message body. Times out after ~20s — magic-link emails
 * typically arrive within 1-2s once the stack is warm, but the first
 * sign-in after a cold dev-server start can take 10-15s while
 * Supabase warms up.
 */
export async function waitForMessage(email: string, timeoutMs = 20_000): Promise<MailpitMessageBody> {
  const deadline = Date.now() + timeoutMs;
  let last: MailpitMessage | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    if (res.ok) {
      const data = (await res.json()) as { messages?: MailpitMessage[] };
      const msg = data.messages?.[0];
      if (msg && msg.ID !== last?.ID) {
        last = msg;
        const body = await fetch(`${env.mailpitUrl}/api/v1/message/${msg.ID}`);
        if (body.ok) return (await body.json()) as MailpitMessageBody;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No message arrived for ${email} within ${timeoutMs}ms`);
}

/**
 * Pull the first magic-link URL out of a Supabase auth email. Supabase
 * templates put it as an `<a href="...">` in the HTML body; we use a
 * regex against the text-rendered body for simplicity.
 */
export function extractMagicLink(body: MailpitMessageBody): string {
  // The plaintext body contains the link as-is (no anchor wrapping).
  const match = body.Text.match(/https?:\/\/\S+/);
  if (!match) throw new Error('No URL found in email body');
  return match[0];
}

/**
 * Convenience: fetch the latest email for `email` and return the
 * magic-link URL in one step.
 */
export async function fetchMagicLinkFor(email: string): Promise<string> {
  const body = await waitForMessage(email);
  return extractMagicLink(body);
}

/**
 * Wipe the Mailpit inbox between tests so the "most recent message"
 * lookup is always the one the current test just triggered.
 */
export async function clearInbox(): Promise<void> {
  await fetch(`${env.mailpitUrl}/api/v1/messages`, { method: 'DELETE' });
}
