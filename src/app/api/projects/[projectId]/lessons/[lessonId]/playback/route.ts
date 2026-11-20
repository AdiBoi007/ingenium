import { withIdentity } from "@/server/identity";
import { playbackHandler } from "@/server/playback";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; lessonId: string }> },
) {
  const p = await params;
  return withIdentity(request, () =>
    playbackHandler(request, p.projectId, p.lessonId),
  );
}
