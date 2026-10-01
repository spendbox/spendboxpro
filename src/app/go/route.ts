import { NextResponse, type NextRequest } from "next/server";
import { getUser, homePathFor } from "@/lib/auth";

// After signing in: business owners go to their dashboard, customers to their Spendbox.
export async function GET(request: NextRequest) {
  const user = await getUser();
  const path = user ? await homePathFor(user.id) : "/login";
  return NextResponse.redirect(new URL(path, request.url));
}
