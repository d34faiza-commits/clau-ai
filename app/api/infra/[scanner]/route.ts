import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { toErrorResponse } from "@/lib/files";
import { scanPorts } from "@/lib/infra/ports";
import { topProcesses } from "@/lib/infra/processes";
import { scanServices } from "@/lib/infra/services";
import { checkSsl } from "@/lib/infra/ssl";
import { scanUpdates } from "@/lib/infra/updates";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/infra/{ports|services|ssl|updates|processes} */
export async function POST(request: Request, { params }: { params: { scanner: string } }) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  try {
    switch (params.scanner) {
      case "ports":
        return NextResponse.json(await scanPorts());
      case "services":
        return NextResponse.json(await scanServices());
      case "ssl":
        return NextResponse.json(await checkSsl(body.domains));
      case "updates":
        return NextResponse.json(await scanUpdates());
      case "processes":
        return NextResponse.json(await topProcesses());
      default:
        return NextResponse.json({ error: "Unknown scanner" }, { status: 404 });
    }
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
