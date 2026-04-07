import type { IncomingMessage, ServerResponse } from "node:http";
import { DASHBOARD_HTML } from "../ui/dashboardHtml.js";

export function handleStaticRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/";
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}
