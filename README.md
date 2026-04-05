# 🤖 AI Pull Request Reviewer

An AI-powered GitHub PR reviewer that automatically analyzes pull requests and posts comments using local or cloud-based LLMs (Ollama, Qwen, Gemini, OpenAI, etc.).

---

## 🚀 Features

- **Multi-Provider Support**: Works with Ollama (local), OpenAI, Gemini, Groq, and more.
- **Surgical Reviews**: Analyzes PR diffs and leaves specific comments on code lines.
- **Severity Levels**: Categorizes issues as Critical, Warning, or Suggestion with emojis.
- **Private Repo Support**: Fully compatible with private GitHub repositories.
- **IPv4 Optimized**: Specifically configured to avoid common macOS/ngrok networking issues.

---

## 🛠 Prerequisites

1. **Node.js**: Version 18 or higher.
2. **ngrok**: For exposing your local server to GitHub webhooks.
3. **Ollama**: (Optional) For running local models like `qwen2.5-coder`.

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy the example environment file and fill in your details:
```bash
cp .env.example .env
```
Key fields to update in `.env`:
- `GITHUB_TOKEN`: Your GitHub Personal Access Token (needs `repo` scope for private repos).
- `GITHUB_WEBHOOK_SECRET`: A secure string for webhook verification.
- `PROVIDER`: Set to `ollama`, `openai`, or `gemini`.
- `LLM_MODEL`: Set to your desired model (e.g., `qwen2.5-coder:1.5b`).

### 3. Start your LLM (e.g., Ollama)
If using Ollama locally:
```bash
OLLAMA_ORIGINS="*" ollama serve
ollama pull qwen2.5-coder:1.5b
```

### 4. Start the Reviewer Server
```bash
npm start
```
The server will start on `http://127.0.0.1:3000`.

### 5. Expose with ngrok
In a separate terminal:
```bash
ngrok http 127.0.0.1:3000
```
Copy the `https://...` URL provided by ngrok.

---

## ⚓ GitHub Webhook Setup

1. Go to your GitHub Repository **Settings > Webhooks > Add webhook**.
2. **Payload URL**: `https://your-ngrok-url.ngrok-free.app/webhook` (Add `/webhook` to the end).
3. **Content type**: `application/json`.
4. **Secret**: Enter the `GITHUB_WEBHOOK_SECRET` from your `.env`.
5. **Events**: Select **Let me select individual events** and check **Pull requests**.
6. Click **Add webhook**.

---

## 📂 Documentation

- [**NGROK.md**](./NGROK.md) — Detailed steps for ngrok troubleshooting and IPv4 setup.
- [**SETUP.md**](./SETUP.md) — Advanced provider configurations (VMs, cloud providers, etc.).

---

## 🧪 Testing
To test the setup without creating a new PR, go to your Webhook settings on GitHub, click **Recent Deliveries**, find a `pull_request` event, and click **Redeliver**.

## 🧪 Test Evidence
**Terminal 1 - server**
npm start
<img width="834" height="335" alt="image" src="https://github.com/user-attachments/assets/6d0758ba-e5a6-4920-b8ea-8f33ba8e3d45" />

**Terminal 2 - ngrok forwarding**
ngrok http 127.0.0.1:3000
<img width="847" height="483" alt="image" src="https://github.com/user-attachments/assets/c1fb09f0-8c9f-4857-9344-f715476b2b31" />

Perform a commit in existing PR or create a new PR in same repository. 

**Github Pull Request Comments-**
<img width="1072" height="709" alt="image" src="https://github.com/user-attachments/assets/9afe7ab4-336b-48b2-89ba-8ada6914c50b" />




