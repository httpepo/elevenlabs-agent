import { NextResponse, type NextRequest } from "next/server";
import { isPanelAuthorized } from "./infrastructure/security/panel-access";

export function proxy(request: NextRequest) {
  if (isPanelAuthorized(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Acesso restrito ao painel interno.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Atlas - Painel", charset="UTF-8"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const config = { matcher: ["/painel/:path*"] };
