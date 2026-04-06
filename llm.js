/**
 * llm.js — Universal LLM Adapter
 *
 * This module sends a text prompt to the configured model provider and returns
 * the raw model text response. It supports Ollama, OpenAI-compatible APIs, and
 * Google Gemini.
 *
 * Configuration is loaded from environment variables:
 *   PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, GEMINI_MODEL
 */

import fetch from "node-fetch";
import "dotenv/config";

const PROVIDER    = (process.env.PROVIDER || "ollama").toLowerCase();
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://localhost:11434";
const LLM_API_KEY  = process.env.LLM_API_KEY  || "";
const LLM_MODEL    = process.env.LLM_MODEL    || "codellama";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// ─── Public: call the configured LLM ─────────────────────────────────────────
/**
 * Send the prompt to the configured LLM provider.
 *
 * @param {string} prompt - The prompt text to send to the model.
 * @returns {Promise<string>} The model response text.
 */
export async function callLLM(prompt) {
  switch (PROVIDER) {
    case "gemini":  return callGemini(prompt);
    case "openai":  return callOpenAICompatible(prompt);
    case "ollama":
    default:        return callOllama(prompt);
  }
}

// ─── Provider label (for GitHub comment footer) ───────────────────────────────
/**
 * Return a human-readable label for the selected LLM provider.
 *
 * @returns {string}
 */
export function providerLabel() {
  switch (PROVIDER) {
    case "gemini": return `Google Gemini · \`${GEMINI_MODEL}\``;
    case "openai": return `OpenAI-compatible · \`${LLM_MODEL}\` @ ${LLM_BASE_URL}`;
    default:       return `Ollama · \`${LLM_MODEL}\` @ ${LLM_BASE_URL}`;
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
/**
 * Send a prompt to an Ollama model endpoint.
 *
 * @param {string} prompt - The prompt text.
 * @returns {Promise<string>} The model response text.
 */
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
/**
 * Send a prompt to an OpenAI-compatible chat/completions endpoint.
 *
 * @param {string} prompt - The prompt text.
 * @returns {Promise<string>} The model response text.
 */
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
/**
 * Send a prompt to Google Gemini.
 *
 * @param {string} prompt - The prompt text.
 * @returns {Promise<string>} The model response text.
 */
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
