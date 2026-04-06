/**
 * Build a prompt that asks the LLM to check the PR diff for syntax errors only.
 *
 * @param {string} diff - The PR diff text.
 * @param {string} [title=""] - The PR title.
 * @returns {string} The prompt sent to the LLM.
 */
export function buildSyntaxCheckPrompt(diff, title = "") {
  return `Act as a strict compiler (g++, clang, or similar). 
Analyze this PR diff for SYNTAX ERRORS ONLY.

PR Title: ${title || "Untitled PR"}

DIFF:
\`\`\`
${diff.slice(0, 10000)}
\`\`\`

Return ONLY valid JSON. Format:
{
  "syntax_errors": [
    {
      "file": "path/to/file.ext",
      "line": 12,
      "message": "Compilation error description",
      "suggestion": "Corrected line of code"
    }
  ]
}

If no syntax errors are found, return {"syntax_errors": []}.
Look specifically for: typos in operators (like < instead of <<), missing semicolons, unmatched brackets, or undeclared variables.`;
}

/**
 * Build a prompt that asks the LLM to perform a complete code review of the PR diff.
 *
 * @param {string} diff - The PR diff text.
 * @param {string} [title=""] - The PR title.
 * @returns {string} The prompt sent to the LLM.
 */
// ─── Standard Review Prompt ───────────────────────────────────────────────
export function buildReviewPrompt(diff, title = "") {
  return `You are an expert senior code reviewer. Analyze this GitHub Pull Request diff and return ONLY a JSON object.

PR Title: ${title || "Untitled PR"}

DIFF:
\`\`\`
${diff.slice(0, 10000)}
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
- Test Coverage: missing tests, edge cases, mocks

Guidelines:
- If overall code is good, provide positive feedback in the summary.
- Omit "line" ONLY if it's a general architectural comment.
- Ensure the "line" number matches the line in the NEW file.
- Be pedagogical: explain the best practice behind your suggestion.`;
}

// ─── Response Parsers ──────────────────────────────────────────────────────────
/**
 * Parse the syntax-check JSON response returned by the LLM.
 *
 * @param {string} raw - Raw model response text.
 * @returns {Array<object>} Normalized syntax error comments.
 */
export function parseSyntaxResponse(raw) {
  try {
    const text = cleanJSON(raw);
    const parsed = JSON.parse(text);
    return (parsed.syntax_errors || []).map(e => ({
      severity: "critical",
      category: "Syntax & Correctness",
      file: e.file || "General",
      line: e.line || null,
      message: `[VIRTUAL COMPILER] ${e.message}`,
      suggestion: e.suggestion || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Parse the standard review JSON response returned by the LLM.
 *
 * @param {string} raw - Raw model response text.
 * @returns {{summary: string, comments: Array<object>}} Parsed review payload.
 */
export function parseReviewResponse(raw) {
  if (!raw) return fallback("Empty response from model.");
  const text = cleanJSON(raw);

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "Review complete.",
      comments: (parsed.comments || []).map(normalizeComment),
    };
  } catch {
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
    return fallback(text.slice(0, 500));
  }
}

function cleanJSON(raw) {
  return raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
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
