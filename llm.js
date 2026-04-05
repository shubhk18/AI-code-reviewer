/**
 * llm.js — Universal LLM Adapter
 *
 * Supports:
 *   PROVIDER=ollama     → Ollama (local or VM)
 *   PROVIDER=gemini     → Google Gemini API
 *   PROVIDER=openai     → OpenAI or any OpenAI-compatible endpoint
 *                         (Qwen, LM Studio, vLLM, Together AI, Groq, etc.)
 *
 * For Qwen Coder on a VM:
 *   PROVIDER=openai
 *   LLM_BASE_URL=http://<your-vm-ip>:8000/v1
 *   LLM_API_KEY=none
 *   LLM_MODEL=qwen2.5-coder:7b
 */

import fetch from "node-fetch";
import "dotenv/config";

const PROVIDER    = (process.env.PROVIDER || "ollama").toLowerCase();
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://localhost:11434";
const LLM_API_KEY  = process.env.LLM_API_KEY  || "";
const LLM_MODEL    = process.env.LLM_MODEL    || "codellama";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// ─── Public: call the configured LLM ─────────────────────────────────────────
export async function callLLM(prompt) {
  switch (PROVIDER) {
    case "gemini":  return callGemini(prompt);
    case "openai":  return callOpenAICompatible(prompt);
    case "ollama":
    default:        return callOllama(prompt);
  }
}

// ─── Provider label (for GitHub comment footer) ───────────────────────────────
export function providerLabel() {
  switch (PROVIDER) {
    case "gemini": return `Google Gemini · \`${GEMINI_MODEL}\``;
    case "openai": return `OpenAI-compatible · \`${LLM_MODEL}\` @ ${LLM_BASE_URL}`;
    default:       return `Ollama · \`${LLM_MODEL}\` @ ${LLM_BASE_URL}`;
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
async function callOllama(prompt) {
  const res = await fetch(`${LLM_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.response;
}

// ─── OpenAI-compatible (Qwen / LM Studio / vLLM / Together / Groq) ───────────
async function callOpenAICompatible(prompt) {
  const baseUrl = LLM_BASE_URL.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (LLM_API_KEY && LLM_API_KEY !== "none") {
    headers["Authorization"] = `Bearer ${LLM_API_KEY}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI-compatible error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${LLM_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }], role: "user" }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}
