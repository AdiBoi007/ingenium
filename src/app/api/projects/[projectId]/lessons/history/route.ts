import { withIdentity } from "@/server/identity";
import { playbackHandler } from "@/server/playback";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const p = await params;
  return withIdentity(request, () => playbackHandler(request, p.projectId));
}
export const DELETE = GET;
