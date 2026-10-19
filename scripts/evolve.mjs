// Advances the MONANYX world by one epoch, renders the animated SVG and rebuilds README.md.
//
//   In GitHub Actions: reads the issue title ("ecosystem|<action>") and the issue author.
//   Locally:           node scripts/evolve.mjs <action> <username>
//                      node scripts/evolve.mjs            (just lets time pass)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../ecosystem/sim.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE = path.join(ROOT, "ecosystem/state.json");
const SVG = path.join(ROOT, "ecosystem/world.svg");
const TEMPLATE = path.join(ROOT, "scripts/README.template.md");
const README = path.join(ROOT, "README.md");
const REPO = process.env.GITHUB_REPOSITORY || "monanyx/monanyx";
const [OWNER, NAME] = REPO.split("/");
const LAB = OWNER.toLowerCase() + ".github.io" === NAME.toLowerCase()
  ? `https://${NAME}/lab/`
  : `https://${OWNER.toLowerCase()}.github.io/${NAME}/lab/`;

const FRAMES = 50;   // animation frames captured
const EVERY = 3;     // ticks between frames
const LOOP = 10;     // seconds per animation loop

// ---------- figure out what happened ----------
const title = process.env.ISSUE_TITLE || "";
let action = process.argv[2] || "time";
let user = process.argv[3] || process.env.ISSUE_USER || OWNER;
if (title) {
  const m = title.trim().toLowerCase().match(/^ecosystem\|([a-z]+)/);
  action = m ? m[1] : "invalid";
}
if (!S.ACTIONS[action] && action !== "time") action = "invalid";

const replyFile = process.env.REPLY_FILE || path.join(process.env.RUNNER_TEMP || ROOT, "reply.md");
const w = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : S.createWorld(20261019);

if (action === "invalid") {
  fs.writeFileSync(replyFile, `That isn't an action this world understands. Use one of the buttons on [the profile](https://github.com/${OWNER}).`);
  console.log("invalid action, nothing changed");
  process.exit(0);
}

// light rate limit: one intervention per person every 10 minutes
const now = Date.now();
const recent = w.log.find((l) => l.user && l.user.toLowerCase() === String(user).toLowerCase() && l.at && now - Date.parse(l.at) < 10 * 60e3);
if (title && recent && user !== OWNER) {
  fs.writeFileSync(replyFile, `Easy, @${user}. Evolution needs a minute. You already intervened in epoch ${recent.epoch}; try again in a few minutes.`);
  console.log("cooldown, nothing changed");
  process.exit(0);
}

// ---------- run the epoch ----------
w.epoch++;
const before = S.stats(w);
const note = S.applyAction(w, action, user);
const silent = action === "time" ? 300 : 0;
for (let i = 0; i < silent; i++) S.step(w);

const frames = [];
const foodFrames = [];
for (let f = 0; f < FRAMES; f++) {
  frames.push(snapshot(w));
  foodFrames.push(new Map(w.food.map((fd) => [fd.id, fd])));
  for (let t = 0; t < EVERY; t++) S.step(w);
}

function snapshot(w) {
  const m = new Map();
  for (const o of w.organisms) m.set(o.id, [Math.round(o.x), Math.round(o.y), o.g.size, o.g.hue, o.g.carn]);
  return m;
}

const st = S.stats(w);
w.history.push({ epoch: w.epoch, herb: st.herbivores, pred: st.predators, food: st.food, speed: +st.speed.toFixed(3), sense: +st.sense.toFixed(2), size: +st.size.toFixed(3) });
if (w.history.length > 160) w.history = w.history.slice(-160);
const who = action === "time" ? null : user;
w.log.unshift({ epoch: w.epoch, user: who, action, note, at: new Date().toISOString() });
w.log = w.log.slice(0, 40);

// keep state compact
for (const o of w.organisms) {
  o.x = +o.x.toFixed(1); o.y = +o.y.toFixed(1); o.vx = +o.vx.toFixed(3); o.vy = +o.vy.toFixed(3); o.e = +o.e.toFixed(2);
  for (const k of ["speed", "sense", "size", "hue"]) o.g[k] = +o.g[k].toFixed(3);
}
for (const f of w.food) { f.x = +f.x.toFixed(1); f.y = +f.y.toFixed(1); }
w.climate.fertility = +w.climate.fertility.toFixed(4);
w.climate.mutation = +w.climate.mutation.toFixed(4);

fs.writeFileSync(STATE, JSON.stringify(w));
fs.writeFileSync(SVG, renderSVG(w, frames, foodFrames, st));
fs.writeFileSync(README, renderReadme(w, st));

const reply = action === "time"
  ? ""
  : `◈ **Intervention received.**\n\n@${user} → **${S.ACTIONS[action].label.toUpperCase()}** in epoch ${w.epoch}: ${note}.\n\n` +
    `Population ${before.population} → **${st.population}** · predators ${st.predators} · living lineages ${st.lineages}.\n\n` +
    `The world has been re-rendered. [Go watch it](https://github.com/${OWNER}). It can take a minute for GitHub's image cache to catch up.`;
fs.writeFileSync(replyFile, reply);
console.log(`epoch ${w.epoch} · ${action} by ${user} · ${note} · pop ${st.population}`);

// =====================================================================
// SVG renderer
// =====================================================================
function renderSVG(w, frames, foodFrames, st) {
  const TOP = 64, WH = S.H, FOOT = 78, TW = S.W, TH = TOP + WH + FOOT;
  const mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
  const neon = "#3dffa2", mag = "#ff3d9a", dim = "#5f7a88", txt = "#cfe9df";
  const dur = `${LOOP}s`;
  const anim = (attr, vals, extra = "") =>
    `<animate attributeName="${attr}" values="${vals.join(";")}" dur="${dur}" repeatCount="indefinite"${extra}/>`;

  // organisms
  const ids = new Set();
  frames.forEach((fr) => fr.forEach((_, id) => ids.add(id)));
  let orgSvg = "";
  for (const id of ids) {
    const xs = [], ys = [], op = [];
    let first = null, last = null, info = null;
    for (const fr of frames) { const v = fr.get(id); if (v) { if (!first) first = v; info = v; } }
    for (const fr of frames) {
      const v = fr.get(id);
      if (v) { last = v; xs.push(v[0]); ys.push(v[1]); op.push(1); }
      else { const p = last || first; xs.push(p[0]); ys.push(p[1]); op.push(0); }
    }
    const [x0, y0, size, hue, carn] = info;
    const r = (size * 1.05).toFixed(1);
    const always = op.every((v) => v === 1);
    const fill = carn ? `hsl(${hue.toFixed(0)},100%,62%)` : `hsl(${hue.toFixed(0)},95%,63%)`;
    const stroke = carn ? ` stroke="#ffe3f0" stroke-width="1.4"` : "";
    orgSvg += `<circle cx="${xs[0]}" cy="${ys[0]}" r="${r}" fill="${fill}"${stroke}${always ? "" : ` opacity="${op[0]}"`}>` +
      anim("cx", xs) + anim("cy", ys) + (always ? "" : anim("opacity", op)) + `</circle>`;
  }

  // food
  const fids = new Map();
  foodFrames.forEach((fr) => fr.forEach((f, id) => fids.set(id, f)));
  let foodSvg = "";
  for (const [id, f] of fids) {
    const op = foodFrames.map((fr) => (fr.has(id) ? 0.7 : 0));
    const always = op.every((v) => v > 0);
    foodSvg += `<circle cx="${Math.round(f.x)}" cy="${Math.round(f.y)}" r="1.6"${always ? "" : ` opacity="${op[0]}"`}>${always ? "" : anim("opacity", op)}</circle>`;
  }

  // intervention marker
  let fx = "";
  const ev = w.event;
  if (ev && ev.x != null) {
    const col = ev.action === "meteor" ? "#ffb347" : ev.action === "predators" ? mag : neon;
    const r1 = ev.r || 70;
    fx = `<g transform="translate(${Math.round(ev.x)},${Math.round(ev.y)})">
      <circle r="10" fill="none" stroke="${col}" stroke-width="2">
        <animate attributeName="r" values="6;${r1};${r1}" keyTimes="0;0.35;1" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0;0" keyTimes="0;0.35;1" dur="${dur}" repeatCount="indefinite"/></circle>
      ${ev.action === "meteor" ? `<circle r="${r1}" fill="none" stroke="${col}" stroke-opacity=".25" stroke-dasharray="3 6"/>` : ""}
      <text y="${-(ev.action === "meteor" ? r1 : 18) - 8}" text-anchor="middle" fill="${col}" font-size="11" letter-spacing="1.5">${esc((ev.user ? "@" + ev.user + " · " : "") + S.ACTIONS[ev.action].label.toUpperCase())}</text>
    </g>`;
  }

  // grid
  let grid = "";
  for (let x = 0; x <= TW; x += 45) grid += `M${x} 0V${WH}`;
  for (let y = 0; y <= WH; y += 40) grid += `M0 ${y}H${TW}`;

  // sparkline
  const hist = w.history.slice(-70);
  const SW = 250, SH = 40, SX = TW - SW - 22, SY = TOP + WH + 22;
  const maxP = Math.max(20, ...hist.map((h) => h.herb + h.pred));
  const line = (key, scale = 1) => hist.map((h, i) =>
    `${(SX + (hist.length < 2 ? 0 : (i / (hist.length - 1)) * SW)).toFixed(1)},${(SY + SH - (h[key] * scale / maxP) * SH).toFixed(1)}`).join(" ");
  const spark = hist.length > 1
    ? `<polyline points="${line("herb")}" fill="none" stroke="${neon}" stroke-width="1.5"/>
       <polyline points="${line("pred", 4)}" fill="none" stroke="${mag}" stroke-width="1.2" stroke-opacity=".9"/>`
    : "";

  const last = w.log.find((l) => l.user);
  const first = w.history[0];
  const dSpeed = first ? ((st.speed / first.speed - 1) * 100) : 0;
  const statBlock = (x, label, value, color = txt) =>
    `<text x="${x}" y="${TOP + WH + 30}" fill="${dim}" font-size="9.5" letter-spacing="2">${label}</text>
     <text x="${x}" y="${TOP + WH + 54}" fill="${color}" font-size="21" font-weight="700">${value}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" width="${TW}" height="${TH}" font-family="${mono}">
<title>MONANYX living ecosystem, epoch ${w.epoch}</title>
<defs>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".65"/></radialGradient>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity=".025"/></pattern>
  <clipPath id="clip"><rect width="${TW}" height="${WH}"/></clipPath>
</defs>
<rect width="${TW}" height="${TH}" rx="14" fill="#04060a"/>

<!-- header -->
<circle cx="26" cy="32" r="5" fill="${neon}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
<circle cx="26" cy="32" r="5" fill="none" stroke="${neon}"><animate attributeName="r" values="5;13" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.6s" repeatCount="indefinite"/></circle>
<text x="44" y="29" fill="${txt}" font-size="17" font-weight="700" letter-spacing="5">MONANYX</text>
<text x="44" y="46" fill="${dim}" font-size="10" letter-spacing="2.2">LIVING ECOSYSTEM · EPOCH ${String(w.epoch).padStart(4, "0")} · TICK ${w.tick.toLocaleString("en-US")}</text>
<text x="${TW - 22}" y="29" fill="${neon}" font-size="10.5" letter-spacing="1.6" text-anchor="end">NEVER SEND AN ORGANIC TO DO A MACHINE'S WORK.</text>
<text x="${TW - 22}" y="46" fill="${dim}" font-size="9.5" letter-spacing="1.6" text-anchor="end">FERTILITY ${w.climate.fertility.toFixed(2)} · MUTATION ${(w.climate.mutation * 100).toFixed(0)}% · ${st.food} FOOD</text>

<!-- world -->
<g transform="translate(0 ${TOP})">
  <g clip-path="url(#clip)">
    <rect width="${TW}" height="${WH}" fill="#060b10"/>
    <path d="${grid}" stroke="#0e1c24" stroke-width="1"/>
    <g>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.95;1" dur="${dur}" repeatCount="indefinite"/>
      <g fill="#b9ff6e">${foodSvg}</g>
      <g filter="url(#glow)">${orgSvg}</g>
    </g>
    ${fx}
    <rect width="${TW}" height="${WH}" fill="url(#scan)"/>
    <rect width="${TW}" height="${WH}" fill="url(#vig)"/>
    <rect x="0" width="${TW}" height="2" fill="${neon}" opacity=".07"><animate attributeName="y" values="0;${WH}" dur="6s" repeatCount="indefinite"/></rect>
  </g>
  <rect x=".5" y=".5" width="${TW - 1}" height="${WH - 1}" fill="none" stroke="#12303a"/>
</g>

<!-- footer -->
${statBlock(22, "POPULATION", st.population)}
${statBlock(150, "PREDATORS", st.predators, mag)}
${statBlock(270, "LINEAGES", st.lineages)}
${statBlock(380, "AVG SPEED", `${st.speed.toFixed(2)}${first && Math.abs(dSpeed) >= 1 ? `<tspan font-size="11" fill="${dSpeed > 0 ? neon : mag}" dx="5">${dSpeed > 0 ? "▲" : "▼"}${Math.abs(dSpeed).toFixed(0)}%</tspan>` : ""}`)}
<text x="22" y="${TH - 8}" fill="${dim}" font-size="9.5" letter-spacing="1.2">${esc(last ? `LAST INTERVENTION ▸ @${last.user} · ${last.note.toUpperCase()}` : "NO INTERVENTIONS YET. BE THE FIRST.")}</text>
<text x="${SX}" y="${TOP + WH + 14}" fill="${dim}" font-size="9" letter-spacing="2">HISTORY <tspan fill="${neon}">● PREY</tspan> <tspan fill="${mag}">● PREDATORS</tspan></text>
${spark}
</svg>`;
}

// =====================================================================
// README
// =====================================================================
function renderReadme(w, st) {
  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const link = (a) => {
    const body = "Just press **Create** below. Nothing else needed.\n\nThe ecosystem reacts in about a minute, this issue closes itself, and your name enters the evolutionary record.\n\n<!-- keep the title exactly as it is -->";
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent("ecosystem|" + a)}&body=${encodeURIComponent(body)}`;
  };
  const keys = Object.keys(S.ACTIONS);
  const cells = keys.map((k) => {
    const A = S.ACTIONS[k];
    return `<td align="center" width="14%"><a href="${link(k)}"><b>${A.icon}<br>${A.label}</b></a><br><sub>${A.blurb}</sub></td>`;
  });
  const actions = `<table>\n<tr>${cells.slice(0, 4).join("")}</tr>\n<tr>${cells.slice(4).join("")}<td align="center"><a href="${LAB}"><b>🔬<br>Open the Lab</b></a><br><sub>real-time, full control</sub></td></tr>\n</table>`;

  const census = S.census(w);
  const rows = Object.entries(w.lineages)
    .map(([id, L]) => ({ id, ...L, n: census[id] || 0 }))
    .sort((a, b) => b.n - a.n || (b.extinct ?? 0) - (a.extinct ?? 0))
    .slice(0, 10)
    .map((L) => {
      const founder = L.founder === "primordial" || L.founder === "abiogenesis" ? `<sub>${L.founder}</sub>` : `[@${L.founder}](https://github.com/${L.founder})`;
      const status = L.n === 0 ? `💀 extinct (epoch ${L.extinct})` : L.n >= 25 ? "🟢 dominant" : L.n >= 8 ? "🟡 holding on" : "🟠 endangered";
      return `| ${L.carn ? "🦈" : "🧫"} **${L.name}** | ${founder} | ${L.n} | ${L.peak} | ${status} |`;
    });
  const lineages = `| Lineage | Founded by | Alive | Peak | Status |\n|:--|:--|--:|--:|:--|\n${rows.join("\n")}`;

  const log = w.log.filter((l) => l.user || l.action === "abiogenesis").slice(0, 8).map((l) => {
    const icon = S.ACTIONS[l.action]?.icon || "🌀";
    return `\`E${String(l.epoch).padStart(3, "0")}\` ${icon} ${l.user ? `[@${l.user}](https://github.com/${l.user}) ` : ""}${l.note}`;
  }).join("  \n") || "_Nobody has touched the world yet. Be the first._";

  const h0 = w.history[0], pct = (a, b) => (b ? `${a >= b ? "+" : ""}${(((a / b) - 1) * 100).toFixed(0)}%` : "");
  const drift = h0
    ? `| Trait | Epoch ${h0.epoch} | Now | Drift |\n|:--|--:|--:|--:|\n` +
      `| Speed | ${h0.speed.toFixed(2)} | ${st.speed.toFixed(2)} | ${pct(st.speed, h0.speed)} |\n` +
      `| Sensing range | ${h0.sense.toFixed(0)} | ${st.sense.toFixed(0)} | ${pct(st.sense, h0.sense)} |\n` +
      `| Body size | ${h0.size.toFixed(2)} | ${st.size.toFixed(2)} | ${pct(st.size, h0.size)} |`
    : "";

  return "<!-- GENERATED FILE. Edit scripts/README.template.md instead. -->\n" + tpl
    .replaceAll("{{ACTIONS}}", actions)
    .replaceAll("{{LINEAGES}}", lineages)
    .replaceAll("{{LOG}}", log)
    .replaceAll("{{DRIFT}}", drift)
    .replaceAll("{{LAB}}", LAB)
    .replaceAll("{{EPOCH}}", String(w.epoch))
    .replaceAll("{{STAMP}}", String(w.tick));
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
