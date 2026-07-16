# Deploying the MoneyMinder frontend to Vercel

This is a plain static site — `index.html`, `style.css`, `app.js`,
`config.js`. No build step, no framework, so Vercel deployment is very
short.

## 1. Point it at your backend
Before pushing, open `config.js` and set the URL to your live
PythonAnywhere backend:
```js
const API_BASE_URL = "https://yourusername.pythonanywhere.com";
```
(No trailing slash.)

## 2. Push to GitHub
From inside `moneyminder-frontend/`:
```
git init
git add .
git commit -m "MoneyMinder frontend"
git branch -M main
git remote add origin https://github.com/yourusername/moneyminder-frontend.git
git push -u origin main
```
(Again — one line at a time.)

## 3. Import into Vercel
1. Go to https://vercel.com and log in (GitHub login is easiest).
2. **Add New... → Project**.
3. Select your `moneyminder-frontend` repo.
4. Framework preset: choose **Other** (or leave it as detected — since
   there's no `package.json`, Vercel treats it as a static site
   automatically).
5. Leave build command and output directory blank — there's nothing to
   build.
6. Click **Deploy**.

That's it. Vercel gives you a URL like `moneyminder-frontend.vercel.app`
within about 30 seconds.

## 4. Test the whole flow
Open your Vercel URL and try signing up. If it works end to end, you're
done. If something breaks, open the browser's dev tools (F12) → Console
and Network tabs — that's where cross-origin issues show up first.

## Common issues
- **"Failed to fetch" / network error**: `config.js` still points at
  `127.0.0.1:5000` — that only exists on your own machine, not from
  Vercel's servers. Double-check step 1.
- **CORS error in the console**: the backend's `CORS(app)` isn't active,
  or you locked it to a different origin than your actual Vercel URL (see
  step 7 in the backend's deploy guide).
- **Blank page**: check the Network tab — if `app.js` or `style.css` 404s,
  the file paths in `index.html` don't match what got deployed. They
  should all be relative (`style.css`, not `/style.css` with a leading
  slash pointing elsewhere).
- **Changing the backend URL later**: edit `config.js`, commit, push —
  Vercel auto-redeploys on every push to `main`.
