<div align="center">

<a href="{{LAB}}"><img src="ecosystem/world.svg?e={{STAMP}}" width="100%" alt="MONANYX: a live artificial-life ecosystem. Organisms forage, reproduce, mutate and get hunted."></a>

**This is not a GIF.** It's a real artificial-life simulation. Every dot carries a genome (speed, sensing range, body size, colour) that it passes on with mutations.
The world lives in this repository, evolves on its own every day, and **reacts when you touch it.**

</div>

### ◈ INTERVENE

Pick one. You'll land on a pre-filled issue: press **Create**, and within about a minute a GitHub Action runs the simulation forward, re-renders the world above, and writes your name into its history. Seed a species and it carries **your username** for as long as it survives.

{{ACTIONS}}

### ◈ LINEAGES

{{LINEAGES}}

### ◈ EVOLUTION SO FAR

Nobody programmed these trends. They come out of selection pressure: predators, droughts and visitors.

{{DRIFT}}

### ◈ EVENT LOG

{{LOG}}

---

<details>
<summary><b>How does a README run a simulation?</b></summary>

<br>

GitHub doesn't execute JavaScript in a README. So the world doesn't run *in* the page. It runs *behind* it:

1. **`ecosystem/sim.mjs`**: a dependency-free artificial-life engine. Herbivores forage, predators hunt, everything pays a metabolic cost (bigger and faster burns more energy), and offspring inherit a mutated copy of the parent's genome.
2. **`ecosystem/state.json`**: the entire world, committed to git. Every epoch is a commit, so the repo history *is* the fossil record.
3. **GitHub Actions**: a daily schedule lets time pass. Opening an `ecosystem|…` issue applies your intervention, simulates the aftermath, and closes the issue with a report.
4. **`ecosystem/world.svg`**: 150 ticks of the aftermath, encoded as SMIL animation, so it plays without a line of JavaScript.
5. **[The Lab]({{LAB}})**: the same engine on a live canvas, loaded from today's real world state. Fork the timeline and break it however you like.

</details>

<div align="center">
<br>
<sub><b>MONANYX</b> · artificial life · emergent complexity · evolutionary computation<br>
Exploring cellular automata, emergent complexity, and the mathematics of life through code.<br><br>
<i>Never send an organic to do a machine's work.</i></sub>
</div>
