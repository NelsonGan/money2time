import { Link } from "@/i18n/navigation";

/**
 * Where each `{token}` in a legal page's copy links to. The words shown come
 * from the page's `links` messages, so a translation only places the token.
 */
const LEGAL_LINKS: Record<string, { href: string; external: boolean }> = {
  dataDeletion: { href: "/data-deletion", external: false },
  googlePermissions: {
    href: "https://myaccount.google.com/permissions",
    external: true,
  },
  userDataPolicy: {
    href: "https://developers.google.com/terms/api-services-user-data-policy",
    external: true,
  },
};

const TOKEN = /\{([A-Za-z][A-Za-z0-9_]*)\}/;

const linkClassName = "text-primary font-semibold hover:underline";

/** One paragraph or list item of a legal page, with its `{token}` links. */
export function LegalText({
  text,
  labels,
}: {
  text: string;
  labels?: Record<string, string>;
}) {
  const parts = text.split(TOKEN);
  if (parts.length === 1) return text;

  return parts.map((part, index) => {
    if (index % 2 === 0) return part;
    const link = LEGAL_LINKS[part];
    const label = labels?.[part];
    if (!link || !label) return `{${part}}`;
    return link.external ? (
      <a
        key={index}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {label}
      </a>
    ) : (
      <Link key={index} href={link.href} className={linkClassName}>
        {label}
      </Link>
    );
  });
}
