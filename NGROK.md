# 🌐 Running with ngrok

Follow these steps to expose your local AI Reviewer to GitHub using ngrok.

---

## 1. Start your local server
Open a terminal in the project root and run:
```bash
npm start
```
*Note: Ensure your `server.js` is set to listen on `127.0.0.1` to avoid IPv6 issues.*

---

## 2. Start ngrok
Open a **new terminal** and run:
```bash
ngrok http 127.0.0.1:3000
```
*Tip: Always use `127.0.0.1` instead of `localhost` to prevent **502 Bad Gateway** errors on macOS.*

---

## 3. Update GitHub Webhook
1. Copy the **Forwarding URL** from your ngrok terminal (e.g., `https://xxxx.ngrok-free.app`).
2. Go to your GitHub Repository **Settings > Webhooks**.
3. Edit your webhook or create a new one:
   - **Payload URL**: `https://xxxx.ngrok-free.app/webhook` (Do not forget the `/webhook` at the end!)
   - **Content type**: `application/json`
   - **Secret**: Must match your `GITHUB_WEBHOOK_SECRET` in `.env`.
   - **Events**: Select **Let me select individual events** and check **Pull requests** only.
4. Click **Update webhook** or **Add webhook**.

---

## 4. Verify Connection
1. In your browser, go to: `https://xxxx.ngrok-free.app/health`
2. You should see a JSON response: `{"status":"ok", "provider": "..."}`.
3. On GitHub, go to the **Recent Deliveries** tab in your Webhook settings.
4. Click **Redeliver** on a previous event to test the trigger.

---

## Common ngrok Errors

| Error | Cause | Fix |
|-------|-------|-----|
| **502 Bad Gateway** | ngrok cannot reach your server. | Ensure `npm start` is running and use `127.0.0.1:3000`. |
| **ERR_NGROK_8012** | IPv6/IPv4 mismatch. | Force `127.0.0.1` in both `server.js` and `ngrok` command. |
| **404 Not Found** | Webhook hitting wrong path. | Ensure your Payload URL ends in `/webhook`. |
| **401 Unauthorized** | Webhook signature mismatch. | Ensure your GitHub Secret matches your `.env` secret. |
