// Single source of truth for the "Add to Chrome" destination.
const STORE_URL = "https://chromewebstore.google.com/detail/chime-in/cejmclgclpggcebfelilehdmgnnlhdom";
document.querySelectorAll("[data-store-link]").forEach((a) => {
  a.href = STORE_URL;
  a.dataset.storeUrl = STORE_URL;
});

/* ---------- hero parallax (transforms only) ---------- */
(() => {
  const layers = [[".m1", 0.2], [".m2", 0.12], [".m3", 0.06]].map(([s, f]) => [document.querySelector(s), f]);
  const sun = document.querySelector(".hero .sun");
  let tick = false;
  const apply = () => {
    tick = false;
    const y = Math.min(window.scrollY, 1200);
    layers.forEach(([el, f]) => el && (el.style.transform = `translate3d(-50%,${(y * f).toFixed(1)}px,0)`));
  };
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(apply); } }, { passive: true });
})();

/* ---------- product simulation ---------- */
(() => {
  const $ = (id) => document.getElementById(id);
  const frame = $("demoFrame"), win = $("win"), viewport = $("viewport"), page = $("page");
  const post = $("bossPost"), commentBtn = $("commentBtn"), cwrap = $("cwrap"), cinput = $("cinput");
  const ctxt = $("ctxt"), postBtn = $("postBtn"), toast = $("toast"), popup = $("popup");
  const chime = $("chimeBtn"), cursor = $("cursor"), steps = [...document.querySelectorAll("#steps li")];
  const modeEls = Object.fromEntries([...document.querySelectorAll(".pp-mode")].map((e) => [e.dataset.mode, e]));
  if (!win) return;

  const RUNS = [
    { mode: "thoughtful", pre: "", out: "Congrats, Mark. Cutting sign-up to first result from weeks to minutes is the part that sticks with me. That’s what customers actually feel on day one. Well earned by the whole team." },
    { mode: "cleanup", pre: "yo this is sick congrats bro", out: "Congratulations, Mark, this is a huge step. Great work to everyone behind Atlas." },
    { mode: "quick", pre: "", out: "Huge milestone, Mark. Congrats to the whole team!" },
  ];

  let W = 1040, H = 680, S = 1, runId = 0, paused = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CANCEL = Symbol("cancel");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (ms, id) => {
    await sleep(ms);
    while (paused) await sleep(250);
    if (id !== runId) throw CANCEL;
  };

  /* layout: render at a fixed design size, scale the whole window to fit */
  function layout() {
    const cw = frame.clientWidth;
    const narrow = cw < 900;
    W = narrow ? 520 : 1040;
    H = narrow ? 720 : 680;
    S = Math.min(1, cw / W);
    win.classList.toggle("narrow", narrow);
    win.style.width = W + "px";
    win.style.height = H + "px";
    viewport.style.height = H - 88 + "px";
    win.style.transform = `translate(${Math.max(0, (cw - W * S) / 2)}px,0) scale(${S})`;
    frame.style.height = H * S + "px";
  }

  /* camera: translate + scale of the page inside the viewport */
  function cam(k, tx, ty, ms) {
    page.style.transition = ms ? `transform ${ms}ms cubic-bezier(.5,0,.2,1)` : "none";
    page.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${k})`;
  }
  const zoomK = () => (W === 520 ? 1.06 : 1.15);
  const extra = () => cwrap.firstElementChild.scrollHeight;
  function camScroll(ms) { cam(1, 0, -(post.offsetTop - 70), ms); }
  function camZoom(ms) {
    const k = zoomK(), vh = H - 88;
    const cx = post.offsetLeft + post.offsetWidth / 2;
    const cy = post.offsetTop + (post.offsetHeight + extra()) / 2;
    cam(k, W / 2 - k * cx, vh / 2 - k * cy, ms);
  }
  const camOut = (ms) => cam(1, 0, -(post.offsetTop - 70), ms);

  /* cursor helpers (coordinates in window design space) */
  function centerOf(el, dx = 0, dy = 0) {
    const r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), s = w.width / win.offsetWidth;
    return [(r.left + r.width / 2 - w.left) / s + dx, (r.top + r.height / 2 - w.top) / s + dy];
  }
  function place(x, y, ms) {
    cursor.style.transition = ms === 0 ? "opacity .4s" : `transform ${ms}ms cubic-bezier(.45,.05,.2,1), opacity .4s`;
    cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
  async function moveTo(el, id, dx = 0, dy = 0) {
    const [x, y] = centerOf(el, dx, dy);
    const cur = cursor.getBoundingClientRect(), w = win.getBoundingClientRect();
    const d = Math.hypot((cur.left - w.left) / S - x, (cur.top - w.top) / S - y);
    const ms = Math.max(600, Math.min(1300, d * 1.6));
    place(x, y, ms);
    await wait(ms + 60, id);
  }
  async function click(el, id) {
    const [x, y] = centerOf(el);
    cursor.classList.add("click");
    const r = document.createElement("span");
    r.className = "ripple"; r.style.left = x + "px"; r.style.top = y + "px";
    win.appendChild(r); setTimeout(() => r.remove(), 700);
    el.classList.add("pressed");
    await wait(150, id);
    cursor.classList.remove("click");
    el.classList.remove("hover");
    await wait(90, id);
    el.classList.remove("pressed");
  }
  const setStep = (n) => steps.forEach((li, i) => li.classList.toggle("on", i === n));

  async function type(text, id, speed = 24) {
    for (let i = 0; i < text.length; ) {
      i = Math.min(text.length, i + 1 + (Math.random() * 2 | 0));
      ctxt.textContent = text.slice(0, i);
      await wait(speed + (Math.random() * 14 | 0), id);
    }
  }
  function setHas(on) {
    cinput.classList.toggle("has", on);
    postBtn.classList.toggle("on", on);
  }

  function reset() {
    cam(1, 0, 0, 0);
    cwrap.classList.remove("open");
    ctxt.textContent = ""; ctxt.classList.remove("selall");
    cinput.classList.remove("focus", "has");
    postBtn.classList.remove("on", "ring");
    toast.classList.remove("show");
    popup.classList.remove("show", "loading");
    chime.classList.remove("active", "hover", "pressed");
    Object.values(modeEls).forEach((e) => e.classList.remove("sel", "hover", "pressed"));
    commentBtn.classList.remove("hover", "pressed");
    cursor.classList.remove("vis", "click");
    place(W * 0.8, H * 0.82, 0);
    setStep(-1);
    void page.offsetWidth;
  }

  async function scene(run, id) {
    reset();
    viewport.style.transition = "opacity .5s"; viewport.style.opacity = 1;
    await wait(700, id);
    setStep(0);
    camScroll(1400);
    await wait(1100, id);
    cursor.classList.add("vis");
    await wait(500, id);
    camZoom(1200);
    await wait(900, id);

    // 1. click Comment
    commentBtn.classList.add("hover");
    await moveTo(commentBtn, id);
    await wait(250, id);
    await click(commentBtn, id);
    cwrap.classList.add("open");
    cinput.classList.add("focus");
    await wait(900, id);

    // optional: the user types a rough draft first (Clean up run)
    if (run.pre) {
      await moveTo(cinput, id, -40, -20);
      setHas(true);
      await type(run.pre, id, 40);
      await wait(700, id);
    }

    // 2. click the Chime In icon in the toolbar
    setStep(1);
    chime.classList.add("hover");
    await moveTo(chime, id);
    await wait(250, id);
    await click(chime, id);
    popup.classList.add("show");
    chime.classList.add("active");
    setStep(2);
    await wait(900, id);

    // 3. pick the mode
    const m = modeEls[run.mode];
    m.classList.add("hover");
    await moveTo(m, id);
    await wait(350, id);
    await click(m, id);
    m.classList.add("sel");
    await wait(200, id);
    popup.classList.add("loading");
    place(...centerOf(m, 60, 120), 800);
    await wait(1900, id);
    popup.classList.remove("show");
    chime.classList.remove("active");
    place(...centerOf(cinput, 120, 40), 900);
    await wait(500, id);
    popup.classList.remove("loading");
    m.classList.remove("sel");
    await wait(300, id);

    // 4. the comment writes itself into the box
    if (run.pre) {
      ctxt.classList.add("selall");
      await wait(450, id);
      ctxt.classList.remove("selall");
      ctxt.textContent = "";
      await wait(200, id);
    }
    setHas(true);
    await type(run.out, id, 22);
    postBtn.classList.add("ring");
    setStep(3);
    await wait(250, id);
    toast.classList.add("show");
    place(...centerOf(cinput, 230, 120), 900);
    await wait(3600, id);

    // 5. zoom out and loop
    toast.classList.remove("show");
    cursor.classList.remove("vis");
    camOut(1300);
    await wait(1500, id);
    viewport.style.opacity = 0;
    await wait(550, id);
  }

  function staticState() {
    reset();
    const run = RUNS[0];
    camZoom(0);
    cwrap.classList.add("open");
    ctxt.textContent = run.out;
    setHas(true);
    toast.classList.add("show");
    setStep(3);
  }

  async function loop(id) {
    let i = 0;
    while (id === runId) {
      try { await scene(RUNS[i++ % RUNS.length], id); }
      catch (e) { if (e !== CANCEL) throw e; return; }
    }
  }
  function start() {
    runId++;
    layout();
    if (reduce) staticState(); else loop(runId);
  }

  let lastNarrow = null;
  new ResizeObserver(() => {
    const narrow = frame.clientWidth < 900;
    if (lastNarrow === null || narrow !== lastNarrow) { lastNarrow = narrow; start(); }
    else {
      layout();
      if (reduce) staticState();
    }
  }).observe(frame);

  new IntersectionObserver((e) => { paused = !e[0].isIntersecting || document.hidden; }, { threshold: 0.05 }).observe(frame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) paused = true; });

  // exposed for review tooling only
  window.__demo = { RUNS };
})();
