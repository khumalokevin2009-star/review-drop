/**
 * Marketing copy and plan data shared between the landing page and the
 * /pricing and /faq pages. Plan LIMITS mirror CLAUDE.md Section 9; the launch
 * PRICING is Free + Pro only — Pro is £19.99/mo with a 30-day free trial
 * (Studio is teased "Coming soon", Enterprise routes to contact). If the plans
 * or price change, update CLAUDE.md Sections 9 & 12 to match.
 */

/** A pricing tier. `kind` drives CTA behaviour (see PricingPage). */
export type PlanKind = "free" | "pro" | "studio" | "enterprise";

export interface PricingTier {
  kind: PlanKind;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: readonly string[];
  /** CTA label for logged-out / generic visitors. */
  cta: string;
  popular: boolean;
  /** Small print under the price (e.g. the trial terms). */
  note?: string;
  /** Studio — not yet purchasable. */
  comingSoon?: boolean;
  /** Enterprise — bespoke, contact instead of Stripe. */
  contactEmail?: string;
}

/**
 * Launch line-up: Free + Pro are live; Studio is teased ("Coming soon"),
 * Enterprise routes to a contact email. Pro is £19.99/mo with a 30-day free
 * trial (card collected upfront via Stripe Checkout).
 */
export const plans: readonly PricingTier[] = [
  {
    kind: "free",
    name: "Free",
    price: "£0",
    period: "forever",
    tagline: "Try it on a real client project.",
    features: [
      "2 active projects",
      "1 review link per project",
      "Unlimited guest commenters",
      "Orvelle watermark on reviews",
    ],
    cta: "Start free",
    popular: false,
  },
  {
    kind: "pro",
    name: "Pro",
    price: "£19.99",
    period: "/month",
    tagline: "For freelancers reviewing weekly.",
    features: [
      "Unlimited projects",
      "Unlimited review links",
      "PDF & CSV export",
      "No watermark",
    ],
    cta: "Start 30-day free trial",
    popular: true,
    note: "30-day free trial, then £19.99/mo. Cancel any time.",
  },
  {
    kind: "studio",
    name: "Studio",
    price: "£39",
    period: "/month",
    tagline: "For small studios with a team.",
    features: [
      "Everything in Pro",
      "3 team members",
      "Shared projects & reviews",
      "Priority support",
    ],
    cta: "Coming soon",
    popular: false,
    comingSoon: true,
  },
  {
    kind: "enterprise",
    name: "Enterprise",
    price: "Let's talk",
    period: "",
    tagline: "For agencies with bespoke needs.",
    features: [
      "Everything in Studio",
      "Custom seats & volume",
      "SSO & security review",
      "A real human on email",
    ],
    cta: "Contact us",
    popular: false,
    contactEmail: "hello@orvellehq.com",
  },
];

/** Plan-comparison rows for /pricing (CLAUDE.md Section 9 limits, verbatim). */
export const planMatrix = [
  { feature: "Active projects", free: "2", pro: "Unlimited", studio: "Unlimited" },
  { feature: "Reviews per project", free: "1", pro: "Unlimited", studio: "Unlimited" },
  { feature: "Guest commenters", free: "Unlimited", pro: "Unlimited", studio: "Unlimited" },
  { feature: "PDF & CSV export", free: "—", pro: "Included", studio: "Included" },
  { feature: "Watermark", free: "Shown", pro: "None", studio: "None" },
  { feature: "Team members", free: "1", pro: "1", studio: "3" },
] as const;

export const comparison = [
  { point: "Client access", them: "Accounts, invites and seats", us: "One link — no login" },
  { point: "Pricing", them: "Per-seat, and it keeps climbing", us: "Flat: £0 or £19.99 — no per-seat" },
  { point: "Free tier", them: "A trial that expires", us: "Free forever, no card" },
  { point: "Comments", them: "Page-level notes", us: "Pinned to the exact pixel" },
  { point: "Handoff", them: "Copy-paste into email", us: "PDF & CSV export" },
] as const;

export const faqs = [
  {
    q: "Do my clients need an account?",
    a: "No. They open your share link, click anywhere on the page, and type. We ask for a name with their first comment so you know who said what — that's it. No sign-up, no password, nothing to install.",
  },
  {
    q: "Is the free plan really free?",
    a: "Yes — free forever, no credit card. You get 2 active projects with a review link each and unlimited client commenters. Reviews carry a small Orvelle watermark; paid plans remove it.",
  },
  {
    q: "Does it work on any site?",
    a: "If it has a URL, it works: WordPress, Webflow, Squarespace, Showit, staging servers, custom builds. Your client reviews the real, live page wherever the site allows it.",
  },
  {
    q: "What happens when a site can't be proxied?",
    a: "Some sites actively block being embedded. When that happens we automatically capture a full screenshot of the page instead, and your client comments on that — pins and all. Feedback always lands.",
  },
  {
    q: "Is my clients' data secure?",
    a: "Everything is served over HTTPS, clients never create passwords with us, and comments are only visible to people with the review link. You can deactivate a link or delete a project at any time, and we never sell or share your data.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, self-serve from your billing page in two clicks — no emails, no retention hoops. Your plan drops to Free at the end of the billing period and your projects stay where they are.",
  },
  {
    q: "What does the watermark look like?",
    a: "On the Free plan, guest review pages show a small \"Powered by Orvelle\" badge in the corner. It never covers your client's site. Pro and Studio remove it entirely.",
  },
  {
    q: "Can my team share one account?",
    a: "Free and Pro are single-seat. Studio includes 3 team members under one flat price — no per-seat charges, ever. Larger teams: get in touch and we'll work something out.",
  },
  {
    q: "What export formats are supported?",
    a: "Pro and Studio can export any project's comments as a clean PDF (for clients and records) or CSV (for spreadsheets and dev handoff), including statuses, page URLs and pin positions.",
  },
  {
    q: "How do I get support?",
    a: "Email hello@orvellehq.com. Orvelle is an independent product built in Milton Keynes, and we usually reply within one business day.",
  },
] as const;

/** Billing-related subset surfaced on /pricing. */
export const billingFaqs = [faqs[1], faqs[5], faqs[6]] as const;

/** Top questions teased on the landing page. */
export const teaserFaqs = [faqs[0], faqs[1], faqs[3]] as const;

export const steps = [
  {
    n: "01",
    name: "Share",
    body: "Create a review link for any staging URL and send it to your client.",
    chip: true,
  },
  {
    n: "02",
    name: "Comment",
    body: "They click anywhere on the live page and type. No account, no setup — that's the whole flow.",
    chip: false,
  },
  {
    n: "03",
    name: "Resolve",
    body: "Feedback lands in your inbox pinned to the exact element. Work through it and mark threads done.",
    chip: false,
  },
] as const;
