import type { IncomingMessage, ServerResponse } from "node:http";
import { DASHBOARD_HTML } from "../ui/dashboardHtml.js";

export function handleStaticRequest(req: IncomingMessage, res: ServerResponse): void {
  const rawUrl = req.url ?? "/";
  const path = rawUrl.split("?")[0];
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}
