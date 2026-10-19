/**
 * Who runs Who Knows Me Better, as shown on the Contact, Terms, Privacy and Refund
 * pages. Razorpay checks these against your KYC, so they must match exactly.
 *
 * Values in [square brackets] are placeholders. While any remain, the policy pages
 * show a "draft" notice so an unfinished page is never mistaken for a final one.
 */
export const BUSINESS = {
  /** Legal name as on PAN / KYC: your own name, or your proprietorship's name. */
  legalName: "[Legal business name]",
  /** Public contact email, ideally on the domain, e.g. hello@whoknowsmebetter.in */
  email: "[hello@whoknowsmebetter.in]",
  /** Public contact phone, with country code. */
  phone: "[+91 XXXXX XXXXX]",
  /** Registered address, line by line. */
  address: ["[Address line 1]", "[Address line 2]", "[City, State PIN]", "India"],
  /** City whose courts handle disputes (usually the city in your address). */
  jurisdictionCity: "[City]",
  /** Person who handles privacy and complaints (India's DPDP Act asks for one). */
  grievanceOfficer: "[Name of grievance officer]",
  /** GSTIN, once registered. Leave null until then. */
  gstin: null as string | null,
  /** Days within which a failed or duplicate payment can be refunded on request. */
  refundRequestDays: 7,
  /** Working days in which an approved refund is sent back. */
  refundProcessingDays: 7,
  /** Minimum age to make a quiz or pay. */
  minimumAge: 18,
  /** Date the policies last changed (YYYY-MM-DD). */
  policiesUpdated: "2026-10-19",
} as const;

/** True while any business detail is still a placeholder. */
export function businessIsDraft(b: { [k: string]: unknown } = BUSINESS): boolean {
  return Object.values(b).some((v) =>
    Array.isArray(v)
      ? v.some((x) => typeof x === "string" && x.startsWith("["))
      : typeof v === "string" && v.startsWith("["),
  );
}

export function formatPolicyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00+05:30`));
}
