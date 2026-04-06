// ─── Prompt Builder ──────────────────────────────────────────────────────────
export function buildReviewPrompt(diff, title = "") {
  return `You are an expert senior code reviewer. Analyze this GitHub Pull Request diff and return ONLY a JSON object.

PR Title: ${title || "Untitled PR"}

DIFF:
\`\`\`
${diff.slice(0, 12000)}
\`\`\`

Return ONLY valid JSON (no markdown, no explanation). Format:
{
  "summary": "2-3 sentence overall assessment highlighting the most important changes",
  "comments": [
    {
      "severity": "critical|warning|suggestion",
      "category": "Security|Performance|Code Quality|Test Coverage",
      "file": "path/to/file.js or General",
      "line": 42,
      "message": "A thorough explanation of WHY this is an issue and its potential impact. Do not be vague.",
      "suggestion": "A clear, copy-pasteable code snippet or a step-by-step fix."
    }
  ]
}

Review focus:
- Security: SQL injection, XSS, hardcoded secrets, insecure auth, exposed API keys
- Performance: N+1 queries, blocking I/O, memory leaks, unnecessary loops
- Code Quality: naming, complexity, error handling, duplication, readability
- Test Coverage: missing tests, untested edge cases, no mocks for external calls

Guidelines:
- If overall code is good, provide positive feedback in the summary.
- Omit "line" ONLY if it's a general architectural comment.
- Ensure the "line" number matches the line in the NEW file.
- Be pedagogical: explain the best practice behind your suggestion.`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────
export function parseReviewResponse(raw) {
  if (!raw) return fallback("Empty response from model.");

  let text = raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "Review complete.",
      comments: (parsed.comments || []).map(normalizeComment),
    };
  } catch {
    // Try to extract JSON from middle of text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          summary: parsed.summary || "Review complete.",
          comments: (parsed.comments || []).map(normalizeComment),
        };
      } catch { /* fall through */ }
    }
    // Return raw text as summary if parsing fails
    return fallback(text.slice(0, 500));
  }
}

function normalizeComment(c) {
  const validSeverities = ["critical", "warning", "suggestion"];
  const validCategories = ["Security", "Performance", "Code Quality", "Test Coverage"];
  return {
    severity: validSeverities.includes(c.severity) ? c.severity : "suggestion",
    category: validCategories.includes(c.category) ? c.category : "Code Quality",
    file: c.file || "General",
    line: typeof c.line === "number" ? c.line : null,
    message: c.message || "",
    suggestion: c.suggestion || "",
  };
}

function fallback(summary) {
  return { summary, comments: [] };
}

// ─── Severity Emoji ───────────────────────────────────────────────────────────
export function getSeverityEmoji(severity) {
  const map = {
    critical: "🔴",
    warning: "🟡",
    suggestion: "🟢",
  };
  return map[severity] || "🔵";
}
