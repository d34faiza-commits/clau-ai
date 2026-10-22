import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { FileError, saveUpload, toErrorResponse } from "@/lib/files";

export const dynamic = "force-dynamic";

/** POST /api/files/upload — multipart form: path, overwrite ("1"), files[]. */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  try {
    const form = await request.formData();
    const target = String(form.get("path") ?? "/");
    const overwrite = form.get("overwrite") === "1";
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new FileError("No files received");

    for (const file of files) await saveUpload(target, file, overwrite);
    return NextResponse.json({ ok: true, uploaded: files.length });
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
