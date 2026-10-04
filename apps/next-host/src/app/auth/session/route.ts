import { authFailureResponse, createRequestJar } from "@plainworks/auth/server"
import { withHostAuth } from "../../../server/identity-provider"
import { routeResponse } from "../../../server/route-response"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  try {
    return await withHostAuth(async ({ auth }) => {
      const { jar } = createRequestJar(request)
      return Response.json(await auth.session.status(jar), {
        headers: { "cache-control": "no-store" },
      })
    })
  } catch (cause) {
    return routeResponse(authFailureResponse(cause))
  }
}
