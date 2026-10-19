# Putting the living ecosystem on your profile

Takes about 5 minutes. You only do this once.

## 1. Drop the files into your repo

```bash
git clone https://github.com/monanyx/monanyx.git
cd monanyx
```

Unzip `monanyx-ecosystem.zip` into this folder and say yes to replacing `README.md`.
Your old Game of Life files (`life.js`, `package.json`) can stay. Nothing here touches them.

```bash
git add .
git commit -m "the world begins"
git push
```

## 2. Two switches on github.com

1. **Settings → Actions → General → Workflow permissions** → select **Read and write permissions** → Save.
   (This lets the world commit its own evolution.)
2. **Settings → Pages → Build and deployment** → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save.
   (This puts the Lab online at `https://monanyx.github.io/monanyx/lab/`.)

Issues must be switched on (Settings → General → Features → Issues). They are by default.

## 3. Test it

Open your profile, click **🌱 Feed**, press **Create** on the issue page.
Go to the **Actions** tab: the `ecosystem` run finishes in under a minute, commits the new world, and closes the issue with a report.
Refresh your profile. GitHub's image cache can lag a minute or two.

## How to change things

| You want to… | Edit |
|---|---|
| Change the README text | `scripts/README.template.md` (never `README.md`, it gets regenerated) |
| Tune the biology | `CFG` and `cost()` in `ecosystem/sim.mjs` |
| Change colours or layout of the animated world | `renderSVG()` in `scripts/evolve.mjs` |
| Run an epoch on your own machine | `node scripts/evolve.mjs feed yourname` |
| Start the world over | delete `ecosystem/state.json`, then `node scripts/evolve.mjs` |

Needs Node 18+ locally. No `npm install`; there are zero dependencies.

## Good to know

- Each person can intervene once every 10 minutes. You, the owner, are exempt.
- GitHub pauses scheduled workflows on repos with no activity for 60 days. Visitor interventions count as activity, and you can always restart it from the Actions tab.
- Every epoch is a commit, so your contribution graph will light up. That's the world breathing.
