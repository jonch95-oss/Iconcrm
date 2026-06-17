import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Issues short-lived client-upload tokens so the browser can upload large
 * import files (e.g. sample sheets with embedded photos) DIRECTLY to Vercel
 * Blob, bypassing the ~4.5MB server-action/route body cap. The server then
 * reads the file back from Blob to import it. Requires an authenticated user.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        if (!session?.user) throw new Error("Unauthorized");
        return {
          allowedContentTypes: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel.sheet.macroEnabled.12",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB headroom
          tokenPayload: JSON.stringify({ uploadedBy: session.user.email ?? "" }),
        };
      },
      onUploadCompleted: async () => {
        // No-op: the import action reads the URL after the client reports success.
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
