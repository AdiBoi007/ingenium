import { withIdentity } from "@/server/identity";
import { youtubeHandler } from "@/server/youtube";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const p = await params;
  return withIdentity(request, () =>
    youtubeHandler(request, p.projectId, ["import"]),
  );
}
