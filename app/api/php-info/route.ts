import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/files";
import { discoverPhpBinaries, getPhpInfo } from "@/lib/phpinfo";

export const dynamic = "force-dynamic";

/** GET /api/php-info?binary=/usr/bin/php — structured info + list of installed PHP versions. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const binary = params.get("binary");
  try {
    // ?refresh=1 re-scans for newly installed PHP versions
    const binaries = await discoverPhpBinaries(params.get("refresh") === "1");
    const info = await getPhpInfo(binary);
    return NextResponse.json({ binaries, info });
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message, binaries: await discoverPhpBinaries().catch(() => []) }, { status });
  }
}
