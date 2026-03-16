import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGitHubStats } from "../lib/githubClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers on every response including errors
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  const username = process.env.GITHUB_USERNAME;

  if (!token || !username) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  try {
    const stats = await fetchGitHubStats(token, username);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");
    return res.status(200).json(stats);
  } catch (err: unknown) {
    // Narrow the unknown error to safely extract a message string
    const message = err instanceof Error ? err.message : "Failed to fetch GitHub stats";
    return res.status(500).json({ error: message });
  }
}