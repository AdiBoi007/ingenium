import { withIdentity } from "@/server/identity";
import { curriculumHandler } from "../../../../../server/curriculum";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return withIdentity(request, () =>
    curriculumHandler(request, projectId, true),
  );
}
export const PATCH = GET;
export const POST = GET;
