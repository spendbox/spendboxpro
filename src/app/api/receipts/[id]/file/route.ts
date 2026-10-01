import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Opens a receipt image. Only the customer who uploaded it and the business it
// was paid to can see it (checked by the database rules), via a 2-minute link.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/receipts/[id]/file">) {
  const { id } = await params;
  if (!(await getUser())) return NextResponse.redirect(new URL("/login", request.url));

  const supabase = await createClient();
  const { data } = await supabase.from("purchases").select("receipt_path").eq("id", id).maybeSingle();
  if (!data?.receipt_path) return new NextResponse("Receipt not found", { status: 404 });

  const { data: signed } = await createAdminClient().storage.from("receipts").createSignedUrl(data.receipt_path, 120);
  if (!signed?.signedUrl) return new NextResponse("Receipt not found", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
