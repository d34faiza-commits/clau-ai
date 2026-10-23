import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { toErrorResponse } from "@/lib/files";
import { runCompliance } from "@/lib/security/compliance";
import { scanCredentials } from "@/lib/security/credentials";
import { clampInt } from "@/lib/security/fs-walk";
import { auditPermissions } from "@/lib/security/permissions";
import { auditPhpIni } from "@/lib/security/phpini";
import { FRAMEWORKS, type Framework } from "@/lib/security/types";
import { scanWebshells } from "@/lib/security/webshell";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/security/{permissions|credentials|webshell|phpini|compliance} */
export async function POST(request: Request, { params }: { params: { scanner: string } }) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  try {
    switch (params.scanner) {
      case "permissions":
        return NextResponse.json(await auditPermissions(body.dir));
      case "credentials":
        return NextResponse.json(await scanCredentials(body.dir, clampInt(body.maxFiles, 5000, 1, 100_000)));
      case "webshell":
        return NextResponse.json(await scanWebshells(body.dir, clampInt(body.maxFiles, 50_000, 1, 200_000)));
      case "phpini":
        return NextResponse.json(await auditPhpIni());
      case "compliance": {
        const framework: Framework = body.framework in FRAMEWORKS ? body.framework : "both";
        return NextResponse.json(await runCompliance(framework));
      }
      default:
        return NextResponse.json({ error: "Unknown scanner" }, { status: 404 });
    }
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
