import Link from "next/link";

type FooterItem = { label: string; href: string; external?: boolean };

// Lucide dropped brand glyphs in 1.x — inline SVG keeps the icon set consistent
// without adding a second icon dep.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12A10 10 0 1 0 10.5 21.9v-7H8v-3h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.3.2 2.3.2v2.5h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 3h-2.4v7A10 10 0 0 0 22 12Z" />
    </svg>
  );
}
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.573L22.5 22h-6.813l-5.34-6.98L4.5 22H1.241l8.02-9.168L1.5 2h6.987l4.82 6.377L18.244 2Zm-1.2 18h1.81L7.05 4H5.12l11.925 16Z" />
    </svg>
  );
}

const wishiLinks: FooterItem[] = [
  { label: "Wishi your Business", href: "https://wishi.me/business", external: true },
  { label: "Pricing", href: "/pricing" },
  { label: "Lux Package", href: "/lux" },
  { label: "Our Story", href: "https://wishi.me/about", external: true },
  { label: "Gift Cards", href: "https://wishi.me/gift-cards", external: true },
  { label: "Press", href: "https://wishi.me/press", external: true },
  { label: "Wedding", href: "https://wishi.me/wedding", external: true },
  { label: "Blog", href: "https://wishi.me/blog", external: true },
];

const appLinks: FooterItem[] = [
  { label: "Chrome Extension", href: "https://wishi.me/chrome-extension", external: true },
];

const supportLinks: FooterItem[] = [
  { label: "Contact Us", href: "mailto:hello@wishi.me", external: true },
  { label: "Terms of Use", href: "https://wishi.me/terms", external: true },
  { label: "Privacy Policy", href: "https://wishi.me/privacy", external: true },
  { label: "Help Center", href: "https://wishi.me/help", external: true },
];

const socials = [
  { Icon: InstagramIcon, href: "https://instagram.com/wikiapp", label: "Instagram" },
  { Icon: FacebookIcon, href: "https://facebook.com/wishiapp", label: "Facebook" },
  { Icon: TwitterIcon, href: "https://twitter.com/wishiapp", label: "Twitter" },
];

function FooterLink({ label, href, external }: FooterItem) {
  const className =
    "font-sans text-sm text-white hover:text-white/70 transition-colors";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-[hsl(0,0%,7%)] text-white py-14">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
          <div>
            <h4 className="text-xs uppercase tracking-widest text-burgundy mb-5">
              Wishi
            </h4>
            <nav className="flex flex-col gap-4">
              {wishiLinks.map((link) => (
                <FooterLink key={link.label} {...link} />
              ))}
            </nav>
            <div className="flex items-center gap-4 mt-8">
              {socials.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-white hover:text-white/70 transition-colors"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-burgundy mb-5">
              App
            </h4>
            <nav className="flex flex-col gap-4">
              {appLinks.map((link) => (
                <FooterLink key={link.label} {...link} />
              ))}
            </nav>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-burgundy mb-5">
              Support
            </h4>
            <nav className="flex flex-col gap-4">
              {supportLinks.map((link) => (
                <FooterLink key={link.label} {...link} />
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Wishi. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
