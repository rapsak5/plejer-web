// Plejer: NFC-mærker på ting i hjemmet. Scan når det er gjort, så tæller appen ned til næste gang.
// Kører med Firebase, når firebase-config.js er udfyldt. Ellers i demotilstand med data på telefonen.

const FB_VERSION = "10.12.2";
const DAG = 864e5;
const MDR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const UGEDAGE = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
const FORSLAG = ["Elkedel", "Afløb", "Vaskemaskine", "Sengetøj", "Røgalarm", "Emhætte", "Støvsugerfilter", "Opvaskemaskine"];
const INTERVALLER = [
  { navn: "Uge", num: 1, enhed: "w" }, { navn: "2 uger", num: 2, enhed: "w" }, { navn: "Måned", num: 1, enhed: "m" },
  { navn: "3 mdr", num: 3, enhed: "m" }, { navn: "6 mdr", num: 6, enhed: "m" }
];

/* ---------- Mærker og symboler ---------- */
const FORMER = {
  cirkel: { navn: "cirkel", farve: "#2F6FD6", fyld: '<circle cx="50" cy="50" r="40"/>', omrids: '<circle cx="50" cy="50" r="36"/>', sw: 12 },
  firkant: { navn: "firkant", farve: "#D64545", fyld: '<rect x="14" y="14" width="72" height="72" rx="8"/>', omrids: '<rect x="18" y="18" width="64" height="64" rx="6"/>', sw: 12 },
  trekant: { navn: "trekant", farve: "#E8B417", fyld: '<polygon points="50,10 92,86 8,86" stroke-width="6" stroke-linejoin="round"/>', omrids: '<polygon points="50,16 88,82 12,82" stroke-linejoin="round"/>', sw: 12 },
  stjerne: { navn: "stjerne", farve: "#2E9E5B", fyld: '<polygon points="50,6 61,38 95,38 67,58 78,91 50,71 22,91 33,58 5,38 39,38" stroke-width="4" stroke-linejoin="round"/>', omrids: '<polygon points="50,12 59,40 89,40 65,57 74,86 50,69 26,86 35,57 11,40 41,40" stroke-linejoin="round"/>', sw: 8 },
  hjerte: { navn: "hjerte", farve: "#8A4FD1", fyld: '<path d="M50 88C20 66 8 50 8 33 8 19 19 10 31 10c9 0 15 5 19 12 4-7 10-12 19-12 12 0 23 9 23 23 0 17-12 33-42 55z"/>', omrids: '<path d="M50 82C24 62 14 49 14 35 14 23 23 16 33 16c8 0 13 5 17 11 4-6 9-11 17-11 10 0 19 7 19 19 0 14-10 27-36 47z" stroke-linejoin="round"/>', sw: 10 },
  draabe: { navn: "dråbe", farve: "#EE7A22", fyld: '<path d="M50 6S18 44 18 63c0 17 14 30 32 30s32-13 32-30C82 44 50 6 50 6z"/>', omrids: '<path d="M50 14S24 46 24 63c0 14 12 25 26 25s26-11 26-25C76 46 50 14 50 14z" stroke-linejoin="round"/>', sw: 10 },
  maane: { navn: "måne", farve: "#1D1F2E", fyld: '<path d="M60 8a42 42 0 1 0 32 60A34 34 0 1 1 60 8z"/>', omrids: '<path d="M60 10a40 40 0 1 0 30 56A32 32 0 1 1 60 10z" stroke-linejoin="round"/>', sw: 10 },
  lyn: { navn: "lyn", farve: "#1A9E9E", fyld: '<polygon points="58,4 16,56 46,56 38,96 84,40 54,40" stroke-width="4" stroke-linejoin="round"/>', omrids: '<polygon points="56,12 24,52 48,52 42,86 76,44 52,44" stroke-linejoin="round"/>', sw: 8 }
};
const FARVENAVN = { cirkel: "Blå", firkant: "Rød", trekant: "Gul", stjerne: "Grøn", hjerte: "Lilla", draabe: "Orange", maane: "Sort", lyn: "Turkis" };
const RAEKKEFOELGE = ["cirkel", "firkant", "trekant", "stjerne", "hjerte", "draabe", "maane", "lyn"];

function maerkeInfo(tagId) {
  const m = /^([AB])([1-8])-[A-Z0-9]{4}$/.exec(tagId || "");
  if (!m) return null;
  const pakke = m[1], nr = +m[2];
  const form = RAEKKEFOELGE[nr - 1];
  const navn = `${FARVENAVN[form]} ${FORMER[form].navn}` + (pakke === "B" ? ", omrids" : "");
  return { pakke, nr, form, kode: pakke + nr, navn };
}
function symbolSvg(tagId, cls = "sym") {
  const i = maerkeInfo(tagId);
  const f = i ? FORMER[i.form] : null;
  const ring = "";
  let form = "";
  if (f) {
    const indre = i.pakke === "B"
      ? `<g fill="none" stroke="${f.farve}" stroke-width="${f.sw}">${f.omrids}</g>`
      : `<g fill="${f.farve}" stroke="${f.farve}" stroke-width="0">${f.fyld}</g>`;
    form = `<g transform="translate(26 22) scale(.48)">${indre}</g>`;
  } else {
    form = '<circle cx="50" cy="46" r="18" fill="#A39B88"/>';
  }
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#fff" stroke="#E3DDCC" stroke-width="1.5"/>${ring}${form}</svg>`;
}

/* ---------- Tid ---------- */
const dagStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dageMellem = (a, b) => Math.round((dagStart(a) - dagStart(b)) / DAG);
const dato = (t) => { const d = new Date(t); return `${d.getDate()}. ${MDR[d.getMonth()]}`; };
function laegTil(t, n, enhed) {
  if (enhed === "d") return t + n * DAG;
  if (enhed === "w") return t + n * 7 * DAG;
  const d = new Date(t), dag = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dag, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}
function intervalTekst(n, enhed) {
  const ord = { d: "dag", w: "uge", m: "måned" }[enhed] || "dag";
  return n === 1 ? `hver ${ord}` : `hver ${n}. ${ord}`;
}
const naesteGang = (o) => o.lastDone ? laegTil(o.lastDone, o.num, o.unit) : (o.createdAt || Date.now());
function status(o) {
  const nu = Date.now(), frist = naesteGang(o), over = frist <= nu, d = dageMellem(frist, nu);
  let tekst;
  if (over) {
    const od = dageMellem(nu, frist);
    tekst = !o.lastDone ? "Aldrig gjort" : od === 0 ? "I dag" : od === 1 ? "1 dag over" : `${od} dage over`;
  } else {
    tekst = d === 0 ? "Senere i dag" : d === 1 ? "I morgen" : d <= 13 ? `Om ${d} dage` : d <= 60 ? `Om ${Math.round(d / 7)} uger` : `Om ${Math.round(d / 30.4)} mdr`;
  }
  const span = Math.max(1, frist - (o.lastDone || frist - 1));
  const pct = over ? 100 : Math.min(100, Math.max(3, ((nu - (o.lastDone || nu)) / span) * 100));
  return { frist, over, d, tekst, klasse: over ? "over" : d <= 6 ? "snart" : "ok", pct };
}

/* ---------- Hjælpere ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function tilfaeldig(n, tegn = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") {
  const r = new Uint8Array(n); crypto.getRandomValues(r);
  return [...r].map((x) => tegn[x % tegn.length]).join("");
}
let beskedTimer;
function besked(tekst) { $("besked").textContent = tekst; clearTimeout(beskedTimer); beskedTimer = setTimeout(() => { $("besked").textContent = ""; }, 3200); }
function gem(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function hent(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

/* ---------- Lager: demo ---------- */
class DemoLager {
  constructor() { this.data = hent("plejer-demo"); this.lyttere = new Set(); this.uid = "demo"; this.demo = true; }
  async start() { return !!this.data; }
  gemNu() { gem("plejer-demo", this.data); this.lyttere.forEach((f) => f()); }
  husstand() { return this.data ? { navn: this.data.navn, invitation: this.data.invitation } : null; }
  medlemmer() { return this.data ? this.data.medlemmer : {}; }
  opgaver() { return this.data ? Object.values(this.data.opgaver) : []; }
  lyt(f) { this.lyttere.add(f); f(); return () => this.lyttere.delete(f); }
  async opretHusstand(navn, ditNavn) {
    this.data = { navn, invitation: "DEMO00", medlemmer: { demo: { name: ditNavn } }, opgaver: {} };
    this.gemNu();
  }
  async deltag() { throw new Error("Deltag med kode virker først, når appen er koblet til Firebase."); }
  async gemOpgave(o) { this.data.opgaver[o.id] = o; this.gemNu(); }
  async opdaterOpgave(id, patch) { Object.assign(this.data.opgaver[id], patch); this.gemNu(); }
  async sletOpgave(id) { delete this.data.opgaver[id]; this.gemNu(); }
  async forlad() { this.data = null; try { localStorage.removeItem("plejer-demo"); } catch (e) {} this.lyttere.forEach((f) => f()); }
  async slaaPushTil() { throw new Error("Påmindelser på tværs af telefoner kræver Firebase."); }
}

/* ---------- Lager: Firebase ---------- */
class FirebaseLager {
  constructor(opsaetning) { this.ops = opsaetning; this.demo = false; this.lyttere = new Set(); this._husstand = null; this._medlemmer = {}; this._opgaver = new Map(); this.af = []; }
  async start() {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
    const [appM, authM, fsM] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    this.fs = fsM; this.base = base;
    this.app = appM.initializeApp(this.ops.config);
    const auth = authM.getAuth(this.app);
    this.db = fsM.initializeFirestore(this.app, { localCache: fsM.persistentLocalCache() });
    const bruger = await new Promise((ok, fejl) => {
      const stop = authM.onAuthStateChanged(auth, (u) => { if (u) { stop(); ok(u); } });
      authM.signInAnonymously(auth).catch(fejl);
    });
    this.uid = bruger.uid;
    const ud = await fsM.getDoc(fsM.doc(this.db, "users", this.uid));
    if (ud.exists() && ud.data().hid) { await this.abonner(ud.data().hid); return true; }
    return false;
  }
  async abonner(hid) {
    const { doc, collection, onSnapshot } = this.fs;
    this.hid = hid; this.af.forEach((f) => f()); this.af = [];
    const klar = new Promise((ok) => {
      this.af.push(onSnapshot(doc(this.db, "households", hid), (s) => { this._husstand = s.exists() ? s.data() : null; this.giv(); ok(); }));
    });
    this.af.push(onSnapshot(collection(this.db, "households", hid, "members"), (s) => {
      this._medlemmer = {}; s.forEach((d) => { this._medlemmer[d.id] = d.data(); }); this.giv();
    }));
    this.opgaverKlar = new Promise((ok) => { this._opgaverKlar = ok; });
    this.af.push(onSnapshot(collection(this.db, "households", hid, "tasks"), (s) => {
      this._opgaver = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); this._opgaverKlar(); this.giv();
    }));
    await klar;
  }
  giv() { this.lyttere.forEach((f) => f()); }
  lyt(f) { this.lyttere.add(f); f(); return () => this.lyttere.delete(f); }
  husstand() { return this._husstand ? { navn: this._husstand.name, invitation: this._husstand.invite } : null; }
  medlemmer() { return this._medlemmer; }
  opgaver() { return [...this._opgaver.values()]; }
  async opretHusstand(navn, ditNavn) {
    const { doc, collection, setDoc } = this.fs;
    const ref = doc(collection(this.db, "households"));
    const kode = tilfaeldig(6);
    await setDoc(ref, { name: navn, members: [this.uid], invite: kode, createdAt: Date.now() });
    await setDoc(doc(this.db, "households", ref.id, "members", this.uid), { name: ditNavn, joinedAt: Date.now(), tokens: [] });
    await setDoc(doc(this.db, "invites", kode), { hid: ref.id, createdAt: Date.now() });
    await setDoc(doc(this.db, "users", this.uid), { hid: ref.id });
    await this.abonner(ref.id);
  }
  async deltag(kode, ditNavn) {
    const { doc, getDoc, setDoc, updateDoc, arrayUnion } = this.fs;
    const inv = await getDoc(doc(this.db, "invites", kode.toUpperCase().trim()));
    if (!inv.exists()) throw new Error("Koden findes ikke. Tjek at den er skrevet rigtigt.");
    const hid = inv.data().hid;
    await updateDoc(doc(this.db, "households", hid), { members: arrayUnion(this.uid) });
    await setDoc(doc(this.db, "households", hid, "members", this.uid), { name: ditNavn, joinedAt: Date.now(), tokens: [] });
    await setDoc(doc(this.db, "users", this.uid), { hid });
    await this.abonner(hid);
  }
  async gemOpgave(o) { const { doc, setDoc } = this.fs; await setDoc(doc(this.db, "households", this.hid, "tasks", o.id), o); }
  async opdaterOpgave(id, patch) { const { doc, updateDoc } = this.fs; await updateDoc(doc(this.db, "households", this.hid, "tasks", id), patch); }
  async sletOpgave(id) { const { doc, deleteDoc } = this.fs; await deleteDoc(doc(this.db, "households", this.hid, "tasks", id)); }
  async forlad() {
    const { doc, updateDoc, deleteDoc, arrayRemove } = this.fs;
    await deleteDoc(doc(this.db, "households", this.hid, "members", this.uid));
    await updateDoc(doc(this.db, "households", this.hid), { members: arrayRemove(this.uid) });
    await deleteDoc(doc(this.db, "users", this.uid));
    this.af.forEach((f) => f()); this.af = []; this._husstand = null; this._opgaver = new Map(); this.hid = null; this.giv();
  }
  async slaaPushTil() {
    const msg = await import(this.base + "firebase-messaging.js");
    if (!(await msg.isSupported())) throw new Error("Denne browser kan ikke modtage påmindelser. På iPhone skal appen først lægges på hjemmeskærmen.");
    const tilladelse = await Notification.requestPermission();
    if (tilladelse !== "granted") throw new Error("Notifikationer er slået fra for Plejer i telefonens indstillinger.");
    const reg = await navigator.serviceWorker.register("sw.js");
    const token = await msg.getToken(msg.getMessaging(this.app), { vapidKey: this.ops.vapidKey, serviceWorkerRegistration: reg });
    const { doc, updateDoc, arrayUnion } = this.fs;
    await updateDoc(doc(this.db, "households", this.hid, "members", this.uid), { tokens: arrayUnion(token) });
    gem("plejer-push", true);
  }
}

/* ---------- Tilstand ---------- */
const S = { lager: null, visning: "henter", data: null, scan: null, lyd: false, sidste: null, slet: false };

/* ---------- Visninger ---------- */
function personNavn(uid) {
  if (!uid) return "";
  if (uid === S.lager.uid) return "dig";
  return S.lager.medlemmer()[uid]?.name || "en anden";
}
function raekke(o) {
  const s = status(o);
  return `<button class="raekke ${s.klasse}" data-handling="vis" data-id="${esc(o.id)}">
    ${s.over ? '<span class="stempel">OVER TID</span>' : ""}
    ${symbolSvg(o.id)}
    <span class="midt"><b>${esc(o.name)}</b><span class="hvor">${o.place ? esc(o.place) + " · " : ""}${esc(intervalTekst(o.num, o.unit))}</span><span class="bar"><i style="width:${s.pct.toFixed(1)}%"></i></span></span>
    <span class="frist">${esc(s.tekst)}</span>
  </button>`;
}
function visStart() {
  const demo = S.lager.demo;
  return `<div class="start">
    <div class="logo"><img src="../ikon.svg" alt="">Plejer</div>
    <p class="lead">Husk det, der aldrig står i kalenderen. Opret jeres husstand, eller deltag i en, der findes.</p>
    ${demo ? '<div class="banner note"><p>Demotilstand: data ligger kun på denne telefon, indtil appen er koblet til Firebase.</p></div>' : ""}
    <form class="kort" id="opret">
      <h2>Opret husstand</h2>
      <div class="felt"><label for="h-navn">Husstandens navn</label><input id="h-navn" maxlength="40" placeholder="Hjemmet" required></div>
      <div class="felt"><label for="dit-navn-1">Dit navn</label><input id="dit-navn-1" maxlength="30" autocomplete="given-name" required></div>
      <button class="knap bred" type="submit">Opret</button>
    </form>
    <form class="kort" id="deltag">
      <h2>Deltag med kode</h2>
      <div class="felt"><label for="kode">Kode fra en i husstanden</label><input id="kode" maxlength="6" autocapitalize="characters" autocomplete="off" required ${demo ? "disabled" : ""}></div>
      <div class="felt"><label for="dit-navn-2">Dit navn</label><input id="dit-navn-2" maxlength="30" autocomplete="given-name" required ${demo ? "disabled" : ""}></div>
      <button class="knap sek bred" type="submit" ${demo ? "disabled" : ""}>Deltag</button>
    </form>
  </div>`;
}
function visHjem() {
  const h = S.lager.husstand() || { navn: "Hjemmet" };
  const alle = S.lager.opgaver().map((o) => ({ o, s: status(o) })).sort((a, b) => a.s.frist - b.s.frist);
  const over = alle.filter((x) => x.s.over), uge = alle.filter((x) => !x.s.over && x.s.d <= 6), senere = alle.filter((x) => !x.s.over && x.s.d > 6);
  let html = `<header class="top"><div><h1>${esc(h.navn)}</h1>
    <div class="sum">${alle.length ? `<span class="${over.length ? "over" : ""}">${over.length} over tid</span> · ${uge.length} denne uge · ${senere.length} senere` : "Ingen opgaver endnu"}</div></div>
    <button class="ikonknap" data-handling="indstillinger" aria-label="Husstand og indstillinger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></button></header>`;
  if (S.lager.demo) html += '<div class="banner note"><p>Demotilstand. Data ligger kun på denne telefon.</p></div>';
  if (over.length) html += `<div class="banner alarm${S.lyd ? " ringer" : ""}"><p><b>${over.length === 1 ? "1 ting er" : over.length + " ting er"} over tid.</b> ${S.lyd ? "Appen bipper, indtil mærket er scannet." : "Slå lyd til, så bipper appen, mens den er åben."}</p><button class="knap" data-handling="lyd">${S.lyd ? "Slå lyd fra" : "Slå lyd til"}</button></div>`;
  if (!alle.length) {
    html += `<div class="kort"><h2>Scan jeres første mærke</h2><p class="daempet">Hold telefonen hen til et Plejer-mærke. Så spørger appen, hvad det skal huske.</p></div>`;
  }
  if (over.length) html += `<section class="liste"><div class="sek-hoved"><h2>Over tid</h2><span>${over.length}</span></div>${over.map((x) => raekke(x.o)).join("")}</section>`;
  if (uge.length) {
    html += `<section class="liste"><div class="sek-hoved"><h2>Denne uge</h2><span>${uge.length}</span></div>`;
    let sidst = null;
    for (const x of uge) {
      if (x.s.d !== sidst) {
        sidst = x.s.d;
        const lbl = x.s.d === 0 ? "I dag" : x.s.d === 1 ? "I morgen" : `${UGEDAGE[new Date(x.s.frist).getDay()]} ${dato(x.s.frist)}`;
        html += `<div class="dag">${esc(lbl)}</div>`;
      }
      html += raekke(x.o);
    }
    html += "</section>";
  }
  if (senere.length) html += `<section class="liste"><div class="sek-hoved"><h2>Senere</h2><span>${senere.length}</span></div>${senere.map((x) => raekke(x.o)).join("")}</section>`;
  html += '<div class="bund-knapper">';
  if ("NDEFReader" in window) html += '<button class="knap bred" data-handling="nfc">Scan mærke</button>';
  else html += '<p class="daempet" style="text-align:center;font-size:15px">Hold telefonen hen til et mærke for at scanne.</p>';
  if (S.lager.demo) html += '<button class="knap sek bred" data-handling="proev">Prøv et mærke</button>';
  html += "</div>";
  return html;
}
function visNyt() {
  const f = S.data, info = maerkeInfo(f.id);
  const frist = f.sidst === "i-dag" ? laegTil(Date.now(), f.num, f.unit) : Date.now();
  return `<div class="maerke-top">
      <span class="etiket">Nyt mærke fundet</span>
      ${symbolSvg(f.id, "stor")}
      <span class="navn">${esc(info.navn)}</span><span class="mono daempet">${esc(info.kode)}</span>
    </div>
    <form id="nyt-form" class="kort">
      <div class="felt"><label for="o-navn">Hvad skal den huske?</label><input id="o-navn" maxlength="50" value="${esc(f.name)}" placeholder="Afkalk elkedel" required></div>
      <div class="chips">${FORSLAG.map((n) => `<button type="button" class="chip" data-handling="forslag" data-v="${esc(n)}" aria-pressed="${f.name === n}">${esc(n)}</button>`).join("")}</div>
      <div class="felt"><label for="o-sted">Hvor (valgfrit)</label><input id="o-sted" maxlength="40" value="${esc(f.place)}" placeholder="Køkken"></div>
      <div class="felt"><span class="etiket">Hvor tit?</span>
        <div class="seg">${INTERVALLER.map((iv, k) => `<button type="button" data-handling="interval" data-k="${k}" aria-pressed="${!f.andet && iv.num === f.num && iv.enhed === f.unit}">${iv.navn}</button>`).join("")}<button type="button" data-handling="andet" aria-pressed="${f.andet}">Andet</button></div>
      </div>
      ${f.andet ? `<div class="raek"><div class="felt"><label for="o-num">Hver</label><input id="o-num" type="number" inputmode="numeric" min="1" max="99" value="${f.num}"></div>
        <div class="felt"><label for="o-enhed">Enhed</label><select id="o-enhed"><option value="d"${f.unit === "d" ? " selected" : ""}>dag</option><option value="w"${f.unit === "w" ? " selected" : ""}>uge</option><option value="m"${f.unit === "m" ? " selected" : ""}>måned</option></select></div></div>` : ""}
      <div class="felt"><span class="etiket">Sidst gjort</span>
        <div class="seg"><button type="button" data-handling="sidst" data-v="i-dag" aria-pressed="${f.sidst === "i-dag"}">I dag</button><button type="button" data-handling="sidst" data-v="ved-ikke" aria-pressed="${f.sidst === "ved-ikke"}">Ved ikke</button></div>
      </div>
      <p class="daempet">Første påmindelse: <b style="color:var(--blaek)">${f.sidst === "i-dag" ? dato(frist) : "med det samme"}</b></p>
      <button class="knap bred" type="submit">Gem og start nedtælling</button>
      <button class="link" type="button" data-handling="hjem">Annullér</button>
    </form>`;
}
function visKlaret() {
  const o = S.lager.opgaver().find((x) => x.id === S.data.id) || S.data.opgave;
  const s = status(o), dage = Math.max(0, dageMellem(s.frist, Date.now()));
  const historik = (o.history || []).slice(0, 4);
  return `<div class="maerke-top">
      <span class="etiket">Mærke scannet · ${new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</span>
      ${symbolSvg(o.id, "stor")}
      <span class="klaret-ord">${S.data.allerede ? "Allerede" : "Klaret"}</span>
      <b style="font-size:22px">${esc(o.name)}</b>
    </div>
    ${S.data.allerede ? `<div class="banner note"><p>Den blev registreret for ${S.data.allerede} min. siden af ${esc(personNavn(o.lastBy))}. Der er ikke talt dobbelt.</p></div>` : ""}
    <div class="tal"><b>${dage}</b><div><b style="font-family:var(--sans);font-size:17px">${dage === 1 ? "dag" : "dage"} til næste gang</b><div class="daempet">${UGEDAGE[new Date(s.frist).getDay()]} ${dato(s.frist)} ${new Date(s.frist).getFullYear()}</div></div></div>
    ${S.lager.demo ? "" : '<p class="daempet">Påmindelsen er stoppet for hele husstanden.</p>'}
    ${historik.length ? `<div><span class="etiket">Sidste gange</span><div class="historik">${historik.map((h) => `<div><span>${dato(h.at)} ${new Date(h.at).getFullYear()}</span><span class="daempet">${esc(personNavn(h.by))}</span></div>`).join("")}</div></div>` : ""}
    <div class="raek">${S.sidste && !S.data.allerede ? '<button class="knap sek" data-handling="fortryd">Fortryd</button>' : ""}<button class="knap" data-handling="hjem">Færdig</button></div>`;
}
function render() {
  const app = $("app");
  if (S.visning === "henter") { app.innerHTML = '<div class="tom"><p>Henter Plejer…</p></div>'; return; }
  if (S.visning === "fejl") { app.innerHTML = `<div class="tom"><p>${esc(S.data)}</p></div>`; return; }
  app.innerHTML = S.visning === "start" ? visStart() : S.visning === "nyt" ? visNyt() : S.visning === "klaret" ? visKlaret() : visHjem();
}

/* ---------- Ark ---------- */
function lukArk() { $("ark").innerHTML = ""; S.slet = false; }
function aabnArk(html) {
  $("ark").innerHTML = `<div class="skygge" data-handling="luk"></div><div class="ark" role="dialog" aria-modal="true"><div class="ark-indre">${html}</div></div>`;
}
function visOpgaveArk(id) {
  const o = S.lager.opgaver().find((x) => x.id === id); if (!o) return;
  const s = status(o);
  aabnArk(`<div style="display:flex;gap:14px;align-items:center">${symbolSvg(o.id, "sym")}<div><h2>${esc(o.name)}</h2><p class="daempet">${o.place ? esc(o.place) + " · " : ""}${esc(intervalTekst(o.num, o.unit))} · ${esc(maerkeInfo(o.id)?.navn || "")}</p></div></div>
    <p>Næste gang: <b>${dato(s.frist)}</b> (${esc(s.tekst.toLowerCase())})</p>
    ${(o.history || []).length ? `<div class="historik">${o.history.slice(0, 5).map((h) => `<div><span>${dato(h.at)}</span><span class="daempet">${esc(personNavn(h.by))}</span></div>`).join("")}</div>` : ""}
    <button class="knap bred" data-handling="klaret-nu" data-id="${esc(o.id)}">Klaret nu</button>
    <div class="raek"><button class="knap sek" data-handling="ret" data-id="${esc(o.id)}">Ret</button><button class="knap sek" data-handling="slet" data-id="${esc(o.id)}">Slet</button></div>`);
}
function visIndstillinger() {
  const h = S.lager.husstand(), m = S.lager.medlemmer();
  aabnArk(`<h2>${esc(h?.navn || "Husstand")}</h2>
    ${S.lager.demo ? '<p class="daempet">Demotilstand. Når appen er koblet til Firebase, kan resten af husstanden deltage med en kode.</p>' : `<span class="etiket">Kode til resten af husstanden</span><div class="kode" id="kode-vis">${esc(h?.invitation || "")}</div><button class="knap sek bred" data-handling="kopier">Kopiér koden</button>`}
    <span class="etiket">Medlemmer</span><div class="medlemmer">${Object.entries(m).map(([uid, x]) => `<div><span>${esc(x.name)}</span><span class="daempet">${uid === S.lager.uid ? "dig" : ""}</span></div>`).join("")}</div>
    ${S.lager.demo ? "" : `<button class="knap bred" data-handling="push">${hent("plejer-push") ? "Påmindelser er slået til" : "Slå påmindelser til"}</button>`}
    <button class="knap sek bred" data-handling="forlad">Forlad husstanden</button>
    <button class="link" data-handling="luk">Luk</button>`);
}

/* ---------- Handlinger ---------- */
async function registrer(o, kilde) {
  const nu = Date.now();
  const sidst = o.lastDone ? Math.floor((nu - o.lastDone) / 6e4) : Infinity;
  if (kilde === "scan" && sidst < 10) { S.sidste = null; S.visning = "klaret"; S.data = { id: o.id, opgave: o, allerede: Math.max(1, sidst) }; render(); return; }
  S.sidste = { id: o.id, lastDone: o.lastDone || null, lastBy: o.lastBy || null, history: o.history || [], dueAt: o.dueAt || null };
  const history = [{ at: nu, by: S.lager.uid }, ...(o.history || [])].slice(0, 10);
  const patch = { lastDone: nu, lastBy: S.lager.uid, history, dueAt: laegTil(nu, o.num, o.unit), lastNotified: null };
  try { await S.lager.opdaterOpgave(o.id, patch); } catch (e) { besked("Kunne ikke gemme. Tjek forbindelsen."); return; }
  ding();
  S.visning = "klaret"; S.data = { id: o.id, opgave: { ...o, ...patch } }; render();
}
async function haandterScan(rå) {
  let id = String(rå || "").toUpperCase().trim();
  const m = /([AB][1-8]-[A-Z0-9]{4})/.exec(id); id = m ? m[1] : id;
  if (!maerkeInfo(id)) { besked("Det mærke kender Plejer ikke."); return; }
  if (S.lager.opgaverKlar) await Promise.race([S.lager.opgaverKlar, new Promise((ok) => setTimeout(ok, 6000))]);
  const o = S.lager.opgaver().find((x) => x.id === id);
  if (o) return registrer(o, "scan");
  S.visning = "nyt"; S.data = { id, name: "", place: "", num: 1, unit: "m", andet: false, sidst: "i-dag" }; render();
}
function laesForm() {
  const f = S.data; if (!f) return;
  const n = $("o-navn"), p = $("o-sted"), num = $("o-num"), en = $("o-enhed");
  if (n) f.name = n.value; if (p) f.place = p.value;
  if (num) f.num = Math.max(1, Math.min(99, parseInt(num.value, 10) || 1)); if (en) f.unit = en.value;
}
async function scanNfc() {
  try {
    const laeser = new NDEFReader(), stop = new AbortController();
    await laeser.scan({ signal: stop.signal });
    besked("Hold telefonen hen til mærket");
    laeser.onreading = (e) => {
      stop.abort();
      const dec = new TextDecoder();
      for (const r of e.message.records) {
        if (r.recordType === "url" || r.recordType === "text") { haandterScan(dec.decode(r.data)); return; }
      }
      besked("Mærket indeholder ikke en Plejer-adresse.");
    };
  } catch (e) { besked("NFC er ikke tilgængelig. Tjek at NFC er slået til."); }
}

/* Lyd */
let lyd = null;
function tone(f, start, varighed, type, styrke) {
  const o = lyd.createOscillator(), g = lyd.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(styrke, start + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, start + varighed);
  o.connect(g).connect(lyd.destination); o.start(start); o.stop(start + varighed + 0.02);
}
function alarm() { if (!lyd) return; const t = lyd.currentTime; [0, .22, .44].forEach((x) => tone(1760, t + x, .16, "square", .12)); try { navigator.vibrate?.([150, 80, 150, 80, 150]); } catch (e) {} }
function ding() { try { lyd = lyd || new (window.AudioContext || window.webkitAudioContext)(); const t = lyd.currentTime; tone(880, t, .18, "sine", .2); tone(1318, t + .14, .35, "sine", .2); } catch (e) {} }
setInterval(() => { if (S.lyd && S.visning === "hjem" && document.visibilityState === "visible" && S.lager.opgaver().some((o) => status(o).over)) alarm(); }, 30000);
setInterval(() => { if (S.visning === "hjem" && !$("ark").innerHTML) render(); }, 60000);

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-handling]"); if (!el) return;
  const h = el.dataset.handling, id = el.dataset.id;
  if (h === "luk") return lukArk();
  if (h === "hjem") { lukArk(); S.visning = "hjem"; S.data = null; return render(); }
  if (h === "vis") return visOpgaveArk(id);
  if (h === "indstillinger") return visIndstillinger();
  if (h === "nfc") return scanNfc();
  if (h === "proev") {
    const brugt = new Set(S.lager.opgaver().map((o) => o.id.slice(0, 2)));
    const kode = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "B1", "B2", "B3", "B4"].find((k) => !brugt.has(k)) || "A1";
    return haandterScan(`${kode}-${tilfaeldig(4)}`);
  }
  if (h === "forslag") { laesForm(); S.data.name = el.dataset.v; render(); return; }
  if (h === "interval") { laesForm(); const iv = INTERVALLER[+el.dataset.k]; Object.assign(S.data, { num: iv.num, unit: iv.enhed, andet: false }); render(); return; }
  if (h === "andet") { laesForm(); S.data.andet = true; render(); return; }
  if (h === "sidst") { laesForm(); S.data.sidst = el.dataset.v; render(); return; }
  if (h === "klaret-nu") { const o = S.lager.opgaver().find((x) => x.id === id); lukArk(); if (o) await registrer(o, "knap"); return; }
  if (h === "ret") {
    const o = S.lager.opgaver().find((x) => x.id === id); lukArk(); if (!o) return;
    S.visning = "nyt"; S.data = { id: o.id, name: o.name, place: o.place || "", num: o.num, unit: o.unit, andet: !INTERVALLER.some((iv) => iv.num === o.num && iv.enhed === o.unit), sidst: o.lastDone ? "i-dag" : "ved-ikke", ret: true, opgave: o };
    return render();
  }
  if (h === "slet") {
    if (!S.slet) { S.slet = true; el.textContent = "Tryk igen for at slette"; el.classList.replace("sek", "fare"); return; }
    try { await S.lager.sletOpgave(id); besked("Opgaven er slettet. Mærket kan bruges igen."); } catch (e) { besked("Kunne ikke slette."); }
    return lukArk();
  }
  if (h === "fortryd") {
    const a = S.sidste; S.sidste = null; if (!a) return;
    const { id: oid, ...gammel } = a;
    try { await S.lager.opdaterOpgave(oid, gammel); besked("Registreringen er fortrudt"); } catch (e) { besked("Kunne ikke fortryde."); }
    S.visning = "hjem"; return render();
  }
  if (h === "lyd") {
    if (!S.lyd) { try { lyd = lyd || new (window.AudioContext || window.webkitAudioContext)(); await lyd.resume(); S.lyd = true; alarm(); } catch (e) { besked("Lyd kan ikke afspilles her."); } }
    else S.lyd = false;
    return render();
  }
  if (h === "kopier") { try { await navigator.clipboard.writeText($("kode-vis").textContent); besked("Koden er kopieret"); } catch (e) { besked("Markér koden og kopiér den."); } return; }
  if (h === "push") { try { await S.lager.slaaPushTil(); besked("Påmindelser er slået til på denne telefon"); visIndstillinger(); } catch (e) { besked(e.message); } return; }
  if (h === "forlad") {
    if (!S.slet) { S.slet = true; el.textContent = "Tryk igen for at forlade"; el.classList.replace("sek", "fare"); return; }
    try { await S.lager.forlad(); } catch (e) { besked("Kunne ikke forlade husstanden."); return; }
    lukArk(); S.visning = "start"; return render();
  }
});

document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = ev.target.id;
  if (id === "opret" || id === "deltag") {
    const knap = ev.target.querySelector("button[type=submit]"); knap.disabled = true;
    try {
      if (id === "opret") await S.lager.opretHusstand($("h-navn").value.trim() || "Hjemmet", $("dit-navn-1").value.trim());
      else await S.lager.deltag($("kode").value, $("dit-navn-2").value.trim());
      S.visning = "hjem"; render(); efterStart();
    } catch (e) { knap.disabled = false; besked(e.message || "Det lykkedes ikke. Prøv igen."); }
    return;
  }
  if (id === "nyt-form") {
    laesForm();
    const f = S.data, navn = f.name.trim();
    if (!navn) { besked("Skriv hvad mærket skal huske"); return; }
    try {
      if (f.ret) {
        const o = f.opgave;
        await S.lager.opdaterOpgave(f.id, { name: navn, place: f.place.trim(), num: f.num, unit: f.unit, dueAt: o.lastDone ? laegTil(o.lastDone, f.num, f.unit) : Date.now() });
        besked("Gemt");
      } else {
        const nu = Date.now(), sidst = f.sidst === "i-dag" ? nu : null;
        await S.lager.gemOpgave({ id: f.id, name: navn, place: f.place.trim(), num: f.num, unit: f.unit, lastDone: sidst, lastBy: sidst ? S.lager.uid : null,
          history: sidst ? [{ at: sidst, by: S.lager.uid }] : [], createdAt: nu, dueAt: sidst ? laegTil(sidst, f.num, f.unit) : nu, lastNotified: null });
        ding(); besked("Mærket er klar");
      }
      S.visning = "hjem"; S.data = null; render();
    } catch (e) { besked("Kunne ikke gemme. Tjek forbindelsen."); }
  }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") lukArk(); });

/* ---------- Opstart ---------- */
function efterStart() {
  if (S.scan) { const s = S.scan; S.scan = null; haandterScan(s); }
}
(async () => {
  const p = new URLSearchParams(location.search);
  S.scan = p.get("t") || p.get("scan");
  try { navigator.serviceWorker?.register("sw.js").catch(() => {}); } catch (e) {}
  if (S.scan) { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
  const ops = self.PLEJER_FIREBASE;
  S.lager = ops && ops.config ? new FirebaseLager(ops) : new DemoLager();
  try {
    const harHusstand = await S.lager.start();
    S.lager.lyt(() => { if (S.visning === "hjem") render(); });
    S.visning = harHusstand ? "hjem" : "start";
    render();
    if (harHusstand) efterStart();
    else if (S.scan) besked("Opret eller deltag i en husstand først. Scan så mærket igen.");
  } catch (e) {
    console.error(e);
    S.visning = "fejl"; S.data = "Plejer kunne ikke starte. Tjek forbindelsen og prøv igen."; render();
  }
})();
