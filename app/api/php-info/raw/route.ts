import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/files";
import { rawPhpInfo } from "@/lib/phpinfo";

export const dynamic = "force-dynamic";

/** GET /api/php-info/raw?binary=… — `php -i` output as a text download. */
export async function GET(request: Request) {
  try {
    const { binary, text } = await rawPhpInfo(new URL(request.url).searchParams.get("binary"));
    const name = binary.replace(/[^A-Za-z0-9.]+/g, "_").replace(/^_+/, "");
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="phpinfo-${name}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
