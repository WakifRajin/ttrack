# Tuition Tracker Pro

This folder contains the split version of the app:
- `index.html`
- `assets/css/styles.css`
- `assets/js/firebase.js`
- `assets/js/app.js`

## Run Locally

Because this app uses ES modules and external Firebase scripts, run it with a local web server (not via double-click `index.html`).

### Option 1: VS Code Live Server
1. Open `ttrack-project` in VS Code.
2. Right-click `index.html`.
3. Choose **Open with Live Server**.

### Option 2: Python HTTP server
From the `ttrack-project` directory:

```bash
python -m http.server 5500
```

Open: `http://localhost:5500`

### Option 3: Node serve
From the `ttrack-project` directory:

```bash
npx serve .
```

Open the URL shown in terminal.

## Deploy

This is a static web app, so it can be deployed on any static host.

### Firebase Hosting
1. Install Firebase CLI:

```bash
npm i -g firebase-tools
```

2. Login:

```bash
firebase login
```

3. In `ttrack-project`, initialize hosting:

```bash
firebase init hosting
```

Suggested answers during setup:
- Public directory: `.`
- Configure as a single-page app: `No`
- Set up automatic builds/deploys with GitHub: `No` (optional)

4. Deploy:

```bash
firebase deploy
```

### Other static hosts
You can also deploy the `ttrack-project` folder to:
- Netlify
- Vercel (static)
- GitHub Pages
- Cloudflare Pages

## Notes

- Firebase config is currently hardcoded in `assets/js/firebase.js`.
- For production hardening, consider moving config/environment handling to build-time variables.
- If Google sign-in is enabled, ensure your deployed domain is added to Firebase Auth authorized domains.
