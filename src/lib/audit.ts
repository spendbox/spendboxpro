import { formatMoney } from "@/lib/format";

// Turns activity-log rows into plain sentences, for the customer ("Mama Put
// recorded…") and for the business ("You recorded… for Member #0012").

export type AuditKind =
  | "purchase_recorded"
  | "purchase_bank"
  | "purchase_receipt"
  | "purchase_confirmed"
  | "purchase_rejected"
  | "purchase_deleted"
  | "purchase_unmatched"
  | "perk_earned"
  | "perk_given"
  | "perk_ungiven"
  | "perk_taken_back"
  | "perk_restored"
  | "perk_deleted";

export interface AuditRow {
  id: string;
  kind: AuditKind;
  title: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
}

/** Good news, a correction, or neutral — used for the dot colour. */
export function auditTone(kind: AuditKind): "good" | "warn" | "neutral" {
  if (["purchase_recorded", "purchase_bank", "purchase_confirmed", "perk_earned", "perk_restored"].includes(kind)) return "good";
  if (["purchase_rejected", "purchase_deleted", "purchase_unmatched", "perk_taken_back", "perk_deleted", "perk_ungiven"].includes(kind)) return "warn";
  return "neutral";
}

function money(row: AuditRow) {
  return row.amount != null ? formatMoney(row.amount, row.currency ?? "NGN") : "a purchase";
}

function quoted(row: AuditRow) {
  return row.title ? `“${row.title}”` : "a perk";
}

/** What happened, told to the customer. */
export function customerSentence(row: AuditRow, business: string) {
  switch (row.kind) {
    case "purchase_recorded":
      return `${business} recorded a purchase of ${money(row)}${row.title ? ` (${row.title})` : ""}`;
    case "purchase_bank":
      return `${business} received your transfer of ${money(row)}`;
    case "purchase_receipt":
      return `Your receipt for ${money(row)} was added`;
    case "purchase_confirmed":
      return `${business} confirmed your payment of ${money(row)}`;
    case "purchase_rejected":
      return `${business} said your payment of ${money(row)} didn't arrive`;
    case "purchase_deleted":
      return `${business} deleted a purchase of ${money(row)}`;
    case "purchase_unmatched":
      return `${business} said a transfer of ${money(row)} wasn't from you`;
    case "perk_earned":
      return `You earned ${quoted(row)} at ${business}`;
    case "perk_given":
      return `${business} marked ${quoted(row)} as given to you`;
    case "perk_ungiven":
      return `${business} undid giving you ${quoted(row)}, so it's ready to use again`;
    case "perk_taken_back":
      return `${quoted(row)} was taken back because the purchase behind it no longer counts`;
    case "perk_restored":
      return `${quoted(row)} is back and ready to use`;
    case "perk_deleted":
      return `${business} removed the perk ${quoted(row)}`;
  }
}

/** What happened, told to the business. */
export function businessSentence(row: AuditRow, member: string) {
  switch (row.kind) {
    case "purchase_recorded":
      return `You recorded ${money(row)} for ${member}`;
    case "purchase_bank":
      return `${money(row)} from ${member} came in through your bank`;
    case "purchase_receipt":
      return `${member} added a receipt for ${money(row)}`;
    case "purchase_confirmed":
      return `You confirmed ${money(row)} from ${member}`;
    case "purchase_rejected":
      return `You marked ${money(row)} from ${member} as not received`;
    case "purchase_deleted":
      return `You deleted a purchase of ${money(row)} for ${member}`;
    case "purchase_unmatched":
      return `You said ${money(row)} wasn't from ${member}`;
    case "perk_earned":
      return `${member} earned ${quoted(row)}`;
    case "perk_given":
      return `You gave ${member} ${quoted(row)}`;
    case "perk_ungiven":
      return `You undid giving ${member} ${quoted(row)}`;
    case "perk_taken_back":
      return `${quoted(row)} was taken back from ${member}`;
    case "perk_restored":
      return `${quoted(row)} came back for ${member}`;
    case "perk_deleted":
      return `You removed ${quoted(row)} while ${member} still had it`;
  }
}
