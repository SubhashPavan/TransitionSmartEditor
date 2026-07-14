# Deploying TransitionSmart Review Studio

Two services on two free-tier hosts:

- **Frontend** (React + Vite) → **Vercel**
- **Backend** (FastAPI) → **Render**

Both auto-deploy on every push to `main`.

---

## 1. Backend on Render

1. Sign in at https://dashboard.render.com and click **New → Blueprint**.
2. Point it at `https://github.com/SubhashPavan/TransitionSmartEditor`.
3. Render reads `render.yaml` and proposes the `ts-sop-editor-api` service. Click **Apply**.
4. Once the service exists, open its **Environment** tab and paste the secrets that were left blank in the blueprint:
   - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`
   - `BLOB_CONNECTION_STRING`
   - `GEMINI_API_KEY`
   - `QDRANT_URL`, `QDRANT_API_KEY` (leave blank to use the local pickled index)
   - `CORS_ORIGINS` — paste your Vercel URL once step 2 is done, e.g. `https://ts-sop-editor.vercel.app,http://localhost:5190`
5. Save → the service redeploys.
6. Verify: `curl https://<your-render-url>/api/health` returns `{"ok": true, ...}`.

Free tier note: the service sleeps after 15 min idle and cold-starts on the next hit (~30 s). Fine for demos.

---

## 2. Frontend on Vercel

1. Sign in at https://vercel.com/new and import `SubhashPavan/TransitionSmartEditor`.
2. In **Configure Project**:
   - **Root Directory** → `frontend`
   - Framework auto-detects as **Vite**. Build + output settings from `vercel.json` win.
3. Under **Environment Variables**, add:
   - `VITE_API_BASE` = `https://<your-render-url>/api` (from step 1)
4. Click **Deploy**.
5. Once the URL exists, go back to Render → your service → Environment → set `CORS_ORIGINS` to include the Vercel URL, then redeploy the backend.

---

## Local dev unchanged

`vite.config.js` still proxies `/api` to `http://localhost:8004`, and `VITE_API_BASE` falls back to `/api` when unset — so `npm run dev` behaves exactly as before.

---

## Rotate a leaked key

If any secret shows up in git history, rotate it in Azure/Gemini/Qdrant first, then update the value on Render (backend) and/or Vercel (frontend), then redeploy.
