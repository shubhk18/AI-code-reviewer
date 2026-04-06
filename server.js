import express from "express";
import crypto from "crypto";
import { Octokit } from "@octokit/rest";
import { callLLM, providerLabel } from "./llm.js";
import { buildReviewPrompt, parseReviewResponse, getSeverityEmoji } from "./reviewer.js";
import "dotenv/config";

const app = express();

// ─── Config ────────────────────────────────────────────────────────────────
const PORT           = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ─── Webhook Signature Verification ──────────────────────────────────────────
function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true;
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── GitHub Helpers ───────────────────────────────────────────────────────────
async function getPRDiff(owner, repo, pullNumber) {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    headers: {
      accept: "application/vnd.github.v3.diff",
    },
  });
  return data;
}

async function postReviewComment(owner, repo, pullNumber, commitSha, review) {
  const comments = (review.comments || [])
    .filter(c => c.file && c.file !== "General" && c.line)
    .map(c => {
      let body = `${getSeverityEmoji(c.severity)} **${c.severity.toUpperCase()} · ${c.category}**\n\n${c.message}`;
      if (c.suggestion) {
        body += `\n\n**💡 Suggested Fix:**\n\n${c.suggestion}`;
      }
      return {
        path: c.file,
        line: c.line,
        body: body,
      };
    });

  await octokit.pulls.createReview({
    owner, repo,
    pull_number: pullNumber,
    commit_id: commitSha,
    body: buildSummaryComment(review),
    event: "COMMENT",
    comments: comments.length > 0 ? comments : undefined,
  });
}

function buildSummaryComment(review) {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  (review.comments || []).forEach(c => { counts[c.severity] = (counts[c.severity] || 0) + 1; });

  const badges = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `**${getSeverityEmoji(s)} ${n} ${s}${n > 1 ? "s" : ""}**`)
    .join("  |  ");

  return [
    "## 🤖 AI Code Review",
    badges ? `\n${badges}\n` : "",
    "### Summary",
    review.summary || "No summary provided.",
    "",
    "### Issues",
    ...(review.comments || []).map(c =>
      `- ${getSeverityEmoji(c.severity)} **[${c.category}]** \`${c.file || "General"}\`${c.line ? ` (Line ${c.line})` : ""} — ${c.message}`
    ),
    "",
    "---",
    `*Reviewed by ${providerLabel()}*`,
  ].join("\n");
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event   = req.headers["x-github-event"];
  const payload = req.body;

  if (event !== "pull_request") return res.json({ ok: true, skipped: true });
  if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
    return res.json({ ok: true, skipped: true });
  }

  const owner  = payload.repository.owner.login;
  const repo   = payload.repository.name;
  const number = payload.pull_request.number;
  const head   = payload.pull_request.head.sha;
  const title  = payload.pull_request.title || "";

  console.log(`📥 PR #${number} ${payload.action} — ${owner}/${repo}`);
  res.json({ ok: true, message: "Review started" });

  setImmediate(async () => {
    try {
      console.log(`🔍 Fetching diff...`);
      const diff = await getPRDiff(owner, repo, number);

      if (!diff || diff.length < 10) {
        console.log("⚠️  Diff too small, skipping.");
        return;
      }

      const prompt = buildReviewPrompt(diff, title);

      console.log(`🧠 Calling LLM (${providerLabel()})...`);
      const raw = await callLLM(prompt);

      const review = parseReviewResponse(raw);
      console.log(`✅ Got ${review.comments?.length || 0} comments`);

      await postReviewComment(owner, repo, number, head, review);
      console.log(`💬 Posted review to PR #${number}`);

    } catch (err) {
      console.error(`❌ Review failed for PR #${number}:`, err.message);
    }
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", provider: providerLabel() });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🚀 PR Reviewer running on port ${PORT}`);
  console.log(`   Provider: ${providerLabel()}\n`);
});
