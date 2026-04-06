import { execSync } from "node:child_process";

export function detectRtk(): { installed: boolean; version: string | null; path: string | null } {
  try {
    const path = execSync("which rtk 2>/dev/null", { encoding: "utf-8" }).trim();
    if (!path) return { installed: false, version: null, path: null };
    const version = execSync("rtk --version 2>/dev/null", { encoding: "utf-8" }).trim();
    return { installed: true, version, path };
  } catch {
    return { installed: false, version: null, path: null };
  }
}

export function getRtkSavings(): { totalTokensSaved: number; totalCommands: number; compressionRate: number } | null {
  try {
    const output = execSync("rtk gain --json 2>/dev/null", { encoding: "utf-8" });
    const data = JSON.parse(output);
    return {
      totalTokensSaved: data.total_tokens_saved ?? data.tokens_saved ?? 0,
      totalCommands: data.total_commands ?? data.commands ?? 0,
      compressionRate: data.compression_rate ?? data.avg_compression ?? 0,
    };
  } catch {
    try {
      const output = execSync("rtk gain 2>/dev/null", { encoding: "utf-8" });
      const tokenMatch = output.match(/(\d[\d,]*)\s*tokens?\s*saved/i);
      const cmdMatch = output.match(/(\d[\d,]*)\s*commands?/i);
      return {
        totalTokensSaved: tokenMatch ? parseInt(tokenMatch[1].replace(/,/g, "")) : 0,
        totalCommands: cmdMatch ? parseInt(cmdMatch[1].replace(/,/g, "")) : 0,
        compressionRate: 0,
      };
    } catch {
      return null;
    }
  }
}
