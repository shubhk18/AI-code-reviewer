/**
 * Build a prompt to identify the primary programming language(s) in the diff.
 */
export function buildLanguageDetectionPrompt(diff) {
  return `Analyze this PR diff and identify the primary programming language(s) used.
Return ONLY a JSON object.

DIFF:
\`\`\`
${diff.slice(0, 5000)}
\`\`\`

Format:
{
  "languages": ["Language1", "Language2"],
  "main": "PrimaryLanguage"
}
`;
}

/**
 * Build a prompt that asks the LLM to check the PR diff for syntax errors only.
 */
export function buildSyntaxCheckPrompt(diff, title = "", commitSha = "", language = "code") {
  return `Act as a strict ${language} compiler. 
Analyze this PR diff for ${language.toUpperCase()} SYNTAX ERRORS ONLY.

PR Title: ${title || "Untitled PR"}
Commit: ${commitSha || "Latest"}

DIFF:
\`\`\`
${diff.slice(0, 25000)}
\`\`\`
${diff.length > 25000 ? "\n[Note: Diff truncated for length.]\n" : ""}

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

LINE NUMBERING RULES:
1. Look at the hunk header: @@ -old,count +new,count @@
2. The "line" property MUST be the absolute line number in the NEW file (+).`;
}

/**
 * Build a prompt that asks the LLM to perform a complete code review.
 */
export function buildReviewPrompt(diff, title = "", commitSha = "", language = "code") {
  return `You are an expert senior ${language} developer. Analyze this ${language} PR diff and return ONLY a JSON object.

PR Title: ${title || "Untitled PR"}
Commit: ${commitSha || "Latest"}

DIFF:
\`\`\`
${diff.slice(0, 25000)}
\`\`\`

Return ONLY valid JSON. Format:
{
  "summary": "2-3 sentence overall assessment",
  "comments": [
    {
      "severity": "critical|warning|suggestion",
      "category": "Security|Performance|Code Quality|Test Coverage",
      "file": "path/to/file.js or General",
      "line": 42,
      "message": "Clear explanation",
      "suggestion": "Code snippet"
    }
  ]
}

LINE NUMBERING RULES:
1. Use hunk headers (@@ -L,n +new_L,n @@) for absolute line numbers in the new file.

Review focus for ${language}:
- Security: SQL injection, XSS, secrets, insecure auth
- Performance: N+1 queries, I/O, memory, loops
- Code Quality: naming, complexity, readability
- ${language} Specifics: Idiomatic patterns and best practices.`;
}

// ─── Response Parsers ──────────────────────────────────────────────────────────

export function parseLanguageResponse(raw) {
  try {
    const text = cleanJSON(raw);
    const parsed = JSON.parse(text);
    return parsed.main || "code";
  } catch {
    return "code";
  }
}

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

export function getSeverityEmoji(severity) {
  const map = { critical: "🔴", warning: "🟡", suggestion: "🟢" };
  return map[severity] || "🔵";
}
