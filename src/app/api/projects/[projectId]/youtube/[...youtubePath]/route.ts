import { withIdentity } from "@/server/identity";
import { youtubeHandler } from "@/server/youtube";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; youtubePath: string[] }> },
) {
  const p = await params;
  return withIdentity(request, () =>
    youtubeHandler(request, p.projectId, p.youtubePath),
  );
}
export const POST = GET;
