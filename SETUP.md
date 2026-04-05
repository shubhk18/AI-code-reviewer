# 🤖 PR Code Reviewer — Universal Edition

One codebase, any LLM. Switch providers by changing a single line in `.env`.

---

## Supported Providers

| Provider | Type | Best for |
|----------|------|---------|
| **Ollama** | Local / VM | Privacy, zero cost, full control |
| **Qwen Coder via Ollama** | Local / VM | Best open-source code model |
| **Qwen Coder via vLLM** | VM (OpenAI-compatible) | High-throughput teams |
| **OpenAI** | Cloud | GPT-4o quality |
| **Google Gemini** | Cloud | Free tier, fast |
| **Groq** | Cloud | Fastest inference, supports Qwen |
| **Together AI** | Cloud | Cheap Qwen Coder cloud option |

---

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env — set PROVIDER and the matching config block
npm start
```

---

## Provider Setup

### Option A — Qwen Coder on a Local Machine (Ollama)

```bash
# Install Ollama: https://ollama.com/download
ollama pull qwen2.5-coder:7b

# Start with CORS enabled
OLLAMA_ORIGINS="*" ollama serve
```

`.env`:
```env
PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=qwen2.5-coder:7b
```

---

### Option B — Qwen Coder on a VM (Ollama)

**On your VM:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull qwen2.5-coder:7b

# Start Ollama and allow external connections
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS="*" ollama serve
```

**Open port 11434** in your VM's firewall / security group.

`.env` on your local machine:
```env
PROVIDER=ollama
LLM_BASE_URL=http://YOUR_VM_IP:11434
LLM_MODEL=qwen2.5-coder:7b
```

**Alternatively, use an SSH tunnel** (more secure — no open ports):
```bash
ssh -L 11434:localhost:11434 user@your-vm-ip
```
Then use `LLM_BASE_URL=http://localhost:11434` as if it were local.

---

### Option C — Qwen Coder on a VM (vLLM — OpenAI-compatible)

vLLM exposes an OpenAI-compatible API, which `llm.js` supports natively.

**On your VM:**
```bash
pip install vllm

python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-Coder-7B-Instruct \
  --port 8000 \
  --host 0.0.0.0
```

`.env`:
```env
PROVIDER=openai
LLM_BASE_URL=http://YOUR_VM_IP:8000/v1
LLM_MODEL=Qwen/Qwen2.5-Coder-7B-Instruct
LLM_API_KEY=none
```

---

### Option D — Groq Cloud (Qwen, fast & free tier)

```env
PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=qwen-qwq-32b
LLM_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Get a key at [console.groq.com/keys](https://console.groq.com/keys).

---

### Option E — Google Gemini

```env
PROVIDER=gemini
LLM_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_MODEL=gemini-1.5-flash
```

Get a key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

---

## GitHub Setup (same for all providers)

### 1. Create a GitHub Token

Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**:
- `Pull requests` → Read and Write
- `Contents` → Read

Paste into `.env` as `GITHUB_TOKEN`.

### 2. Expose your server

```bash
# ngrok (free)
ngrok http 3000

# or Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

### 3. Add the Webhook

Go to **your repo → Settings → Webhooks → Add webhook**:
- **Payload URL**: your ngrok/tunnel URL + `/webhook` (e.g., `https://xxxx.ngrok-free.app/webhook`)
- **Content type**: `application/json`
- **Secret**: `openssl rand -hex 32` → paste here and in `.env` as `GITHUB_WEBHOOK_SECRET`
- **Events**: Select **Let me select individual events** and check **Pull requests** only.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **502 Bad Gateway (ngrok)** | Use `ngrok http 127.0.0.1:3000` instead of `localhost:3000`. |
| **ERR_NGROK_8012** | Ensure your server is listening on `127.0.0.1`. Check `app.listen` in `server.js`. |
| **404 Not Found (Webhook)** | Ensure your Payload URL ends in `/webhook`. |
| **404 Not Found (GitHub API)** | Your `GITHUB_TOKEN` lacks permissions. For private repos, it needs the `repo` scope. |
| **Review failed / No trigger** | Check **Recent Deliveries** in GitHub Webhook settings. Redeliver to test. |
| **Connection refused (Ollama)** | Ensure Ollama is running: `OLLAMA_ORIGINS="*" ollama serve`. |
| **Model mismatch** | Check `ollama ps` to see which model is loaded and update `LLM_MODEL` in `.env`. |

### Useful Commands

**Check local server:**
```bash
curl http://127.0.0.1:3000/health
```

**Check Ollama models:**
```bash
ollama ps
# or
curl http://localhost:11434/api/tags
```

**Force IPv4 on macOS:**
If ngrok fails to connect, ensure your server is explicitly bound to IPv4 in `server.js`:
```javascript
app.listen(PORT, "127.0.0.1", () => { ... });
```
