import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const ReceiptSchema = z.object({
  is_payment_receipt: z
    .boolean()
    .describe("True for a payment receipt, transfer confirmation, POS slip or till receipt"),
  payment_successful: z
    .boolean()
    .nullable()
    .describe("False if the receipt says the payment failed, was reversed or is still pending"),
  amount: z.number().nullable().describe("Total amount paid, as a plain number (₦5,000.00 → 5000)"),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. NGN for ₦"),
  paid_date: z.string().nullable().describe("Date of payment as YYYY-MM-DD"),
  paid_time: z.string().nullable().describe("Time of payment as 24-hour HH:MM"),
  recipient_name: z.string().nullable().describe("Name of the account or person that received the money"),
  recipient_account_number: z
    .string()
    .nullable()
    .describe("Recipient account number exactly as printed, with each hidden digit written as *"),
  recipient_bank: z.string().nullable(),
  merchant_name: z.string().nullable().describe("Shop or business name printed on a till or POS receipt"),
  sender_name: z.string().nullable(),
  reference: z.string().nullable().describe("Transaction reference, session ID or receipt number"),
  description: z
    .string()
    .nullable()
    .describe("What the payment was for: the narration or remark, otherwise a short summary of items bought"),
});

export type ExtractedReceipt = z.infer<typeof ReceiptSchema>;

export class ReceiptReadError extends Error {}

const SYSTEM = `You read payment receipts for a customer rewards app used by small businesses, mostly in Nigeria. Receipts are photos, screenshots or PDFs of bank transfer confirmations (Opay, Moniepoint, PalmPay, Kuda, GTBank, Access and other banking apps), POS slips, mobile money receipts and shop till receipts.

Copy what is printed; never guess. Use null for anything you cannot read clearly. Account numbers are often partly hidden: copy the visible digits in place and write each hidden digit as *. Keep the description under 120 characters.`;

let client: Anthropic | null = null;

/** Reads a receipt image or PDF with Claude and returns the payment details. */
export async function extractReceipt(data: Buffer, mediaType: string): Promise<ExtractedReceipt> {
  client ??= new Anthropic();
  const base64 = data.toString("base64");
  const file: Anthropic.Beta.Messages.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: base64,
          },
        };

  try {
    const response = await client.beta.messages.parse({
      model: process.env.RECEIPT_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      // If the model declines, the API retries on a fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ReceiptSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [file, { type: "text", text: "Extract the payment details from this receipt." }],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new ReceiptReadError("We couldn't read this receipt. Please try a clearer photo or screenshot.");
    }
    return response.parsed_output;
  } catch (error) {
    if (error instanceof ReceiptReadError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ReceiptReadError("Receipt reading isn't set up correctly yet. (Owner: check ANTHROPIC_API_KEY.)");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ReceiptReadError("Lots of receipts right now. Please try again in a minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ReceiptReadError("We couldn't open this file. Please upload a JPG, PNG or PDF receipt.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Receipt reading failed", error.status, error.message);
      throw new ReceiptReadError("Receipt reading is having trouble. Please try again shortly.");
    }
    throw error;
  }
}
