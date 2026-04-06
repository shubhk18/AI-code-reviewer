import express from "express";
import crypto from "crypto";
import { Octokit } from "@octokit/rest";
import { callLLM, providerLabel } from "./llm.js";
import { 
  buildSyntaxCheckPrompt, 
  buildReviewPrompt, 
  parseSyntaxResponse, 
  parseReviewResponse, 
  getSeverityEmoji 
} from "./reviewer.js";
import "dotenv/config";

/**
 * PR Reviewer Server
 *
 * This server receives GitHub pull request webhook events, validates the
 * webhook signature, fetches the PR diff, and runs a two-pass analysis using
 * a configured LLM provider.
 *
 * Pass 1: syntax check / virtual compiler errors
 * Pass 2: standard code review
 *
 * Finally, it posts a GitHub review back to the PR with summary and inline
 * comments.
 */
const app = express();

// ─── Config ────────────────────────────────────────────────────────────────
const PORT           = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// ─── Retry Helper ─────────────────────────────────────────────────────────────
/**
 * Execute a promise-returning function with retry logic.
 *
 * @param {() => Promise<any>} fn - The function to execute.
 * @param {number} retries - Number of retry attempts.
 * @param {number} delay - Delay between retries in milliseconds.
 * @returns {Promise<any>} The returned value from the executed function.
 */
async function withRetry(fn, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`⚠️  Attempt ${i + 1} failed, retrying in ${delay / 1000}s...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ─── Webhook Signature Verification ──────────────────────────────────────────
/**
 * Verify a GitHub webhook request signature.
 *
 * @param {import("express").Request} req - Incoming Express request.
 * @returns {boolean} True when the signature is valid or no secret is configured.
 */
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
/**
 * Fetch the diff for a GitHub pull request.
 *
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {number} pullNumber - Pull request number.
 * @returns {Promise<string>} The diff text.
 */
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

/**
 * Post a review on the PR with an optional summary and inline comments.
 *
 * @param {string} owner - Repository owner.
 * @param {string} repo - Repository name.
 * @param {number} pullNumber - Pull request number.
 * @param {string} commitSha - The head commit SHA.
 * @param {object} review - Parsed review object containing summary and comments.
 */
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

  try {
    await octokit.pulls.createReview({
      owner, repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      body: buildSummaryComment(review),
      event: "COMMENT",
      comments: comments.length > 0 ? comments : undefined,
    });
  } catch (err) {
    if (err.message.includes("Line could not be resolved")) {
      console.log("⚠️  Line resolution failed (AI hallucination). Falling back to summary-only review.");
      await octokit.pulls.createReview({
        owner, repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        body: buildSummaryComment(review, true),
        event: "COMMENT",
      });
    } else {
      throw err;
    }
  }
}

/**
 * Build the summary body for the GitHub review.
 *
 * @param {object} review - Parsed review object from the LLM.
 * @param {boolean} includeFullDetails - Whether to include all comments in the summary.
 * @returns {string} Formatted Markdown summary for the PR review.
 */
function buildSummaryComment(review, includeFullDetails = false) {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  (review.comments || []).forEach(c => { counts[c.severity] = (counts[c.severity] || 0) + 1; });

  const badges = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `**${getSeverityEmoji(s)} ${n} ${s}${n > 1 ? "s" : ""}**`)
    .join("  |  ");

  const lines = [
    "## 🤖 AI Code Review",
    badges ? `\n${badges}\n` : "",
    "### Summary",
    review.summary || "No summary provided.",
    "",
    "### Issues Found",
  ];

  (review.comments || []).forEach(c => {
    lines.push(`- ${getSeverityEmoji(c.severity)} **[${c.category}]** \`${c.file || "General"}\`${c.line ? ` (Line ${c.line})` : ""} — ${c.message}`);
    if (includeFullDetails && c.suggestion) {
      lines.push(`  > **Suggested Fix:**\n  > \`\`\`\n  > ${c.suggestion.replace(/\n/g, "\n  > ")}\n  > \`\`\``);
    }
  });

  lines.push("", "---", `*Reviewed by ${providerLabel()}*`);
  return lines.join("\n");
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

      // ─── Pass 1: Syntax Check (Virtual Compilation) ───
      console.log(`🔍 Pass 1: Syntax Check (${providerLabel()})...`);
      const syntaxPrompt = buildSyntaxCheckPrompt(diff, title, head);
      const syntaxRaw = await withRetry(() => callLLM(syntaxPrompt), 3, 5000);
      const syntaxComments = parseSyntaxResponse(syntaxRaw);

      // ─── Pass 2: Standard Review ───
      console.log(`🔍 Pass 2: Standard Review (${providerLabel()})...`);
      const reviewPrompt = buildReviewPrompt(diff, title, head);
      const reviewRaw = await withRetry(() => callLLM(reviewPrompt), 3, 5000);
      const review = parseReviewResponse(reviewRaw);

      // Merge comments
      review.comments = [...syntaxComments, ...review.comments];
      
      console.log(`✅ Got ${review.comments?.length || 0} comments total`);

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
