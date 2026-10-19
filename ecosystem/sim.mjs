// MONANYX — artificial life engine
// One file, no dependencies. Runs in Node (GitHub Actions) and in the browser (the Lab).
// Deterministic: same state + same actions => same world.

export const W = 900;
export const H = 400;

export const CFG = {
  maxOrganisms: 170,
  maxPredators: 10,
  maxFood: 260,
  foodEnergy: 22,
  birthEnergy: 55,
  splitAt: 125,
  maxEnergy: 200,
  baseFood: 1.05, // food spawned per tick at fertility 1
};

// ---------- seeded randomness ----------
export function rand(w) {
  w.rng = (w.rng + 0x6d2b79f5) | 0;
  let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (w, a, b) => a + rand(w) * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- world ----------
export function createWorld(seed = 42) {
  const w = {
    v: 1,
    rng: seed | 0,
    tick: 0,
    epoch: 0,
    nextId: 1,
    climate: { fertility: 1, mutation: 0.12 },
    organisms: [],
    food: [],
    lineages: {},
    history: [],
    log: [],
    event: null,
  };
  const founders = [
    { id: "aurora", name: "Aurora", hue: 158 },
    { id: "ember", name: "Ember", hue: 28 },
    { id: "cobalt", name: "Cobalt", hue: 205 },
  ];
  for (const f of founders) {
    registerLineage(w, f.id, f.name, "primordial", f.hue, 0);
    for (let i = 0; i < 14; i++)
      spawn(w, rr(w, 40, W - 40), rr(w, 40, H - 40), randomGenome(w, f.hue, 0), f.id);
  }
  for (let i = 0; i < 140; i++) addFood(w, rr(w, 5, W - 5), rr(w, 5, H - 5));
  return w;
}

export function registerLineage(w, id, name, founder, hue, carn) {
  if (!w.lineages[id])
    w.lineages[id] = { name, founder, hue: Math.round(hue), carn, born: w.epoch, peak: 0, extinct: null };
  return w.lineages[id];
}

export function randomGenome(w, hue, carn) {
  return {
    speed: carn ? rr(w, 1.9, 2.5) : rr(w, 1.0, 2.0),
    sense: rr(w, 35, 80),
    size: carn ? rr(w, 5.2, 6.4) : rr(w, 3, 4.6),
    hue: (hue + rr(w, -8, 8) + 360) % 360,
    carn,
  };
}

export function spawn(w, x, y, g, lin, energy = 70, force = false) {
  if (!force && w.organisms.length >= CFG.maxOrganisms) return null;
  const a = rand(w) * Math.PI * 2;
  const o = { id: w.nextId++, x, y, vx: Math.cos(a), vy: Math.sin(a), e: energy, age: 0, g, lin };
  w.organisms.push(o);
  return o;
}

export function addFood(w, x, y) {
  if (w.food.length >= CFG.maxFood) return;
  w.food.push({ id: w.nextId++, x: clamp(x, 3, W - 3), y: clamp(y, 3, H - 3) });
}

function mutate(w, g, rate) {
  const m = (v, spread, lo, hi) => (rand(w) < rate ? clamp(v * (1 + rr(w, -spread, spread)), lo, hi) : v);
  return {
    speed: m(g.speed, 0.18, 0.4, 3.4),
    sense: m(g.sense, 0.2, 12, 150),
    size: m(g.size, 0.14, 2, 8.5),
    hue: rand(w) < rate ? (g.hue + rr(w, -14, 14) + 360) % 360 : g.hue,
    carn: g.carn,
  };
}

// metabolic cost: big + fast is expensive, sensing is expensive
export function cost(g) {
  const base = 0.07 + 0.0011 * g.size ** 3 * g.speed ** 2 / 4 + 0.0012 * g.sense;
  return g.carn ? base * 0.8 : base;
}

// ---------- one tick ----------
export function step(w) {
  w.tick++;
  const c = w.climate;

  // food grows (in soft patches so the world has terrain-like texture)
  let n = CFG.baseFood * c.fertility;
  while (n > 0) {
    if (rand(w) < n) {
      const px = (Math.sin(w.tick * 0.003 + rand(w) * 6.28) * 0.5 + 0.5) * W;
      const near = rand(w) < 0.55 && w.food.length;
      if (near) {
        const f = w.food[Math.floor(rand(w) * w.food.length)];
        addFood(w, f.x + rr(w, -26, 26), f.y + rr(w, -26, 26));
      } else addFood(w, rand(w) < 0.5 ? px : rr(w, 0, W), rr(w, 0, H));
    }
    n -= 1;
  }

  // climate relaxes back to baseline
  c.fertility += ((c.base ?? 1) - c.fertility) * 0.0016;
  c.mutation += ((c.mbase ?? 0.12) - c.mutation) * 0.004;

  const orgs = w.organisms;
  const born = [];
  let preds = 0;
  for (const o of orgs) if (o.g.carn) preds++;

  for (const o of orgs) {
    if (o.dead) continue;
    o.age++;
    const g = o.g;
    let tx = 0, ty = 0, has = false, flee = false;

    if (!g.carn) {
      // flee nearest predator in range
      let pd = g.sense * 0.75, px = 0, py = 0;
      for (const p of orgs) {
        if (!p.g.carn || p.dead) continue;
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        if (d < pd) { pd = d; px = p.x; py = p.y; flee = true; }
      }
      if (flee) { tx = o.x - (px - o.x); ty = o.y - (py - o.y); has = true; }
      else {
        let best = g.sense, bf = null;
        for (const f of w.food) {
          const d = Math.abs(f.x - o.x) + Math.abs(f.y - o.y);
          if (d < best) { best = d; bf = f; }
        }
        if (bf) { tx = bf.x; ty = bf.y; has = true; }
      }
    } else {
      let best = o.e < 110 ? g.sense * 1.2 : 0, bp = null; // satiated predators cruise
      for (const p of orgs) {
        if (p.g.carn || p.dead || p.g.size * 1.12 > g.size) continue;
        const d = Math.abs(p.x - o.x) + Math.abs(p.y - o.y);
        if (d < best) { best = d; bp = p; }
      }
      if (bp) { tx = bp.x; ty = bp.y; has = true; }
    }

    const sp = g.speed * (flee ? 1.15 : g.carn && has ? 1.3 : 1);
    if (has) {
      const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy) || 1;
      o.vx += ((dx / d) * sp - o.vx) * 0.22;
      o.vy += ((dy / d) * sp - o.vy) * 0.22;
    } else {
      const a = Math.atan2(o.vy, o.vx) + rr(w, -0.35, 0.35);
      o.vx += (Math.cos(a) * sp * 0.7 - o.vx) * 0.15;
      o.vy += (Math.sin(a) * sp * 0.7 - o.vy) * 0.15;
    }
    o.x += o.vx; o.y += o.vy;
    if (o.x < 3) { o.x = 3; o.vx = Math.abs(o.vx); }
    if (o.x > W - 3) { o.x = W - 3; o.vx = -Math.abs(o.vx); }
    if (o.y < 3) { o.y = 3; o.vy = Math.abs(o.vy); }
    if (o.y > H - 3) { o.y = H - 3; o.vy = -Math.abs(o.vy); }

    o.e -= cost(g);

    // eat
    if (!g.carn) {
      for (let i = 0; i < w.food.length; i++) {
        const f = w.food[i];
        if (Math.abs(f.x - o.x) < g.size + 2.5 && Math.abs(f.y - o.y) < g.size + 2.5) {
          o.e = Math.min(CFG.maxEnergy, o.e + CFG.foodEnergy);
          w.food.splice(i, 1);
          break;
        }
      }
    } else {
      for (const p of orgs) {
        if (p.g.carn || p.dead) continue;
        if (Math.hypot(p.x - o.x, p.y - o.y) < g.size + p.g.size + 2 && p.g.size * 1.12 <= g.size) {
          p.dead = "eaten";
          o.e = Math.min(CFG.maxEnergy, o.e + p.e * 0.45 + 14);
          break;
        }
      }
    }

    // reproduce (asexual split, inherited + mutated genome)
    const cap = g.carn ? preds < CFG.maxPredators : true;
    if (o.e > (g.carn ? 165 : CFG.splitAt) && cap && (g.carn || orgs.length + born.length < CFG.maxOrganisms)) {
      o.e -= CFG.birthEnergy + 8;
      const child = {
        id: w.nextId++, x: o.x + rr(w, -4, 4), y: o.y + rr(w, -4, 4),
        vx: -o.vx, vy: -o.vy, e: CFG.birthEnergy, age: 0,
        g: mutate(w, g, c.mutation), lin: o.lin,
      };
      born.push(child);
      if (g.carn) preds++;
    }

    if (o.e <= 0) o.dead = "starved";
    else if (o.age > 1500 + g.size * 60 && rand(w) < 0.004) o.dead = "old";
  }

  w.organisms = orgs.filter((o) => !o.dead).concat(born);

  // abiogenesis: if every herbivore is gone, life restarts from the soup
  if (!w.organisms.some((o) => !o.g.carn)) {
    const n3 = Object.keys(w.lineages).filter((k) => k.startsWith("genesis")).length + 1;
    const id = "genesis-" + n3, hue = (90 + n3 * 47) % 300;
    registerLineage(w, id, "Genesis " + n3, "abiogenesis", hue, 0);
    for (let i = 0; i < 12; i++) spawn(w, rr(w, 40, W - 40), rr(w, 40, H - 40), randomGenome(w, hue, 0), id, 80, true);
    w.log.unshift({ epoch: w.epoch, user: null, action: "abiogenesis", note: "all herbivores died, life re-emerged from the soup" });
  }

  // lineage bookkeeping
  const counts = census(w);
  for (const [id, L] of Object.entries(w.lineages)) {
    const n2 = counts[id] || 0;
    if (n2 > L.peak) L.peak = n2;
    if (n2 === 0 && L.extinct === null) L.extinct = w.epoch;
    if (n2 > 0) L.extinct = null;
  }
}

export function census(w) {
  const c = {};
  for (const o of w.organisms) c[o.lin] = (c[o.lin] || 0) + 1;
  return c;
}

export function stats(w) {
  const herb = w.organisms.filter((o) => !o.g.carn);
  const pred = w.organisms.length - herb.length;
  const avg = (k) => (herb.length ? herb.reduce((s, o) => s + o.g[k], 0) / herb.length : 0);
  const alive = Object.keys(census(w)).length;
  return {
    population: w.organisms.length, herbivores: herb.length, predators: pred,
    food: w.food.length, lineages: alive,
    speed: avg("speed"), sense: avg("sense"), size: avg("size"),
  };
}

// ---------- interventions ----------
export const ACTIONS = {
  feed:      { icon: "🌱", label: "Feed",              blurb: "drops a food surplus into the world" },
  bloom:     { icon: "🌸", label: "Bloom",             blurb: "fertility surges, food regrows fast" },
  drought:   { icon: "☀️", label: "Drought",           blurb: "fertility collapses, only the efficient survive" },
  radiation: { icon: "🧬", label: "Radiation",         blurb: "mutation rate spikes, genomes scramble" },
  predators: { icon: "🦈", label: "Release predators", blurb: "an apex lineage named after you enters the world" },
  meteor:    { icon: "☄️", label: "Meteor",            blurb: "an impact wipes out a region" },
  seed:      { icon: "🧪", label: "Seed a species",    blurb: "a new lineage named after you: will it survive?" },
};

export function applyAction(w, action, user = "anon") {
  const u = String(user).replace(/[^A-Za-z0-9-]/g, "").slice(0, 39) || "anon";
  const h = hashStr(u + w.epoch);
  const c = w.climate;
  let note = "";
  w.event = { action, user: u, x: null, y: null };

  if (action === "feed") {
    for (let k = 0; k < 4; k++) {
      const cx = rr(w, 60, W - 60), cy = rr(w, 50, H - 50);
      for (let i = 0; i < 26; i++) addFood(w, cx + rr(w, -45, 45), cy + rr(w, -45, 45));
    }
    note = "dropped a food surplus";
  } else if (action === "bloom") {
    c.fertility = 2.1; note = "triggered a bloom";
  } else if (action === "drought") {
    c.fertility = 0.25;
    w.food = w.food.filter(() => rand(w) < 0.4);
    note = "triggered a drought";
  } else if (action === "radiation") {
    c.mutation = 0.6;
    for (const o of w.organisms) o.g = mutate(w, o.g, 0.7);
    note = "irradiated the world";
  } else if (action === "predators") {
    const id = "apex-" + u.toLowerCase();
    const hue = 330 + (h % 30);
    registerLineage(w, id, u, u, hue % 360, 1);
    const x = rr(w, 80, W - 80), y = rr(w, 60, H - 60);
    for (let i = 0; i < 4; i++) spawn(w, x + rr(w, -20, 20), y + rr(w, -20, 20), randomGenome(w, hue % 360, 1), id, 110, true);
    w.event.x = x; w.event.y = y;
    note = "released apex predators";
  } else if (action === "meteor") {
    const x = rr(w, 120, W - 120), y = rr(w, 90, H - 90), r = 130;
    const before = w.organisms.length;
    w.organisms = w.organisms.filter((o) => Math.hypot(o.x - x, o.y - y) > r);
    w.food = w.food.filter((f) => Math.hypot(f.x - x, f.y - y) > r);
    w.event.x = x; w.event.y = y; w.event.r = r;
    note = `meteor impact, ${before - w.organisms.length} organisms lost`;
  } else if (action === "seed") {
    const id = "sp-" + u.toLowerCase();
    let hue = (h % 360);
    if (hue > 300) hue -= 90; // keep magenta reserved for predators
    registerLineage(w, id, u, u, hue, 0);
    if (w.lineages[id].extinct !== null) w.lineages[id].extinct = null;
    const x = rr(w, 80, W - 80), y = rr(w, 60, H - 60);
    const g0 = randomGenome(w, hue, 0);
    for (let i = 0; i < 10; i++) spawn(w, x + rr(w, -25, 25), y + rr(w, -25, 25), mutate(w, g0, 0.5), id, 90, true);
    for (let i = 0; i < 25; i++) addFood(w, x + rr(w, -60, 60), y + rr(w, -60, 60));
    w.event.x = x; w.event.y = y;
    note = "seeded a new species";
  } else {
    w.event = { action: "time", user: null };
    return "time passed";
  }
  return note;
}
