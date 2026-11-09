export const CONTACT_EMAIL = "support@money2time.com";

export type ContactDraft = {
  email: string;
  message: string;
  name: string;
  subject: string;
};

export function createContactMailto({
  email,
  message,
  name,
  subject,
}: ContactDraft) {
  const normalizedSubject = subject.trim()
    ? `Money2Time contact: ${subject.trim()}`
    : "Money2Time contact form";

  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    message,
  ].join("\n");

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(normalizedSubject)}&body=${encodeURIComponent(body)}`;
}
