import { paraglideMiddleware } from "./paraglide/server.js"
import handler from "@tanstack/react-start/server-entry"

export default {
	fetch(req: Request): Promise<Response> {
		// TanStack Router already handles URL rewrite; keep original request
		// to avoid duplicate de-localization in middleware.
		return paraglideMiddleware(req, () => handler.fetch(req))
	},
}
