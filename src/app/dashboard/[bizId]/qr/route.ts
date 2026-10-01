import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireOwnedBusiness } from "@/lib/auth";
import { siteUrl } from "@/lib/env";

// Download a print-quality QR code for the business's join link.
export async function GET(_request: Request, { params }: RouteContext<"/dashboard/[bizId]/qr">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const png = await QRCode.toBuffer(`${siteUrl()}/j/${business.slug}`, {
    width: 1200,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#14201A", light: "#FFFFFF" },
  });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${business.slug}-spendbox-qr.png"`,
    },
  });
}
