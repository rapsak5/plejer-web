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
// Pakke 1 (A1 til A8): hvide mærker med fyldte former.
// Pakke 2 (B1 til B8): sorte mærker med otte andre former, så de ikke kan forveksles med pakke 1.
const PAKKER = {
  A: { navn: "Pakke 1", bund: "#FFFFFF", kant: "#E3DDCC", former: [
    ["cirkel", "Blå", "#2F6FD6", '<circle cx="50" cy="50" r="40"/>'],
    ["firkant", "Rød", "#D64545", '<rect x="14" y="14" width="72" height="72" rx="8"/>'],
    ["trekant", "Gul", "#E8B417", '<polygon points="50,10 92,86 8,86" stroke-width="6" stroke-linejoin="round"/>'],
    ["stjerne", "Grøn", "#2E9E5B", '<polygon points="50,6 61,38 95,38 67,58 78,91 50,71 22,91 33,58 5,38 39,38" stroke-width="4" stroke-linejoin="round"/>'],
    ["hjerte", "Lilla", "#8A4FD1", '<path d="M50 88C20 66 8 50 8 33 8 19 19 10 31 10c9 0 15 5 19 12 4-7 10-12 19-12 12 0 23 9 23 23 0 17-12 33-42 55z"/>'],
    ["dråbe", "Orange", "#EE7A22", '<path d="M50 6S18 44 18 63c0 17 14 30 32 30s32-13 32-30C82 44 50 6 50 6z"/>'],
    ["måne", "Sort", "#1D1F2E", '<path d="M60 8a42 42 0 1 0 32 60A34 34 0 1 1 60 8z"/>'],
    ["lyn", "Turkis", "#1A9E9E", '<polygon points="58,4 16,56 46,56 38,96 84,40 54,40" stroke-width="4" stroke-linejoin="round"/>']
  ] },
  B: { navn: "Pakke 2", bund: "#1E1D1A", kant: "#1E1D1A", former: [
    ["sekskant", "Blå", "#4C8DF0", '<polygon points="29,13 71,13 92,50 71,87 29,87 8,50" stroke-width="6" stroke-linejoin="round"/>'],
    ["rude", "Rød", "#EC5A5A", '<polygon points="50,6 90,50 50,94 10,50" stroke-width="6" stroke-linejoin="round"/>'],
    ["krone", "Gul", "#F2C230", '<polygon points="8,28 30,52 50,16 70,52 92,28 82,84 18,84" stroke-width="6" stroke-linejoin="round"/>'],
    ["kløver", "Grøn", "#3DBE70", '<circle cx="50" cy="29" r="19"/><circle cx="29" cy="55" r="19"/><circle cx="71" cy="55" r="19"/><circle cx="50" cy="48" r="14"/><path d="M46 58h8l4 34H42z"/>'],
    ["sky", "Lilla", "#A877EE", '<circle cx="33" cy="58" r="19"/><circle cx="55" cy="43" r="24"/><circle cx="74" cy="60" r="16"/><rect x="14" y="58" width="76" height="18" rx="9"/>'],
    ["blomst", "Orange", "#F28A3A", '<circle cx="50" cy="24" r="17"/><circle cx="75" cy="42" r="17"/><circle cx="65" cy="72" r="17"/><circle cx="35" cy="72" r="17"/><circle cx="25" cy="42" r="17"/><circle cx="50" cy="50" r="12" fill="#1E1D1A"/>'],
    ["plus", "Hvid", "#FFFFFF", '<polygon points="37,10 63,10 63,37 90,37 90,63 63,63 63,90 37,90 37,63 10,63 10,37 37,37" stroke-width="6" stroke-linejoin="round"/>'],
    ["pil", "Turkis", "#25BDBD", '<polygon points="50,6 91,48 64,48 64,92 36,92 36,48 9,48" stroke-width="6" stroke-linejoin="round"/>']
  ] }
};
// Et mærke hedder fx A1-K3P9. Flere opgaver på samme mærke har id'et A1-K3P9_X7QD og feltet tag.
const MAERKE_RE = /^([AB])([1-8])-[A-Z0-9]{4}$/;
const tagAf = (o) => o.tag || o.id;
function maerkeInfo(tagId) {
  const m = MAERKE_RE.exec(tagId || "");
  if (!m) return null;
  const pakke = m[1], nr = +m[2], p = PAKKER[pakke];
  const [form, farvenavn, farve, svg] = p.former[nr - 1];
  return { pakke, nr, form, farve, svg, bund: p.bund, kant: p.kant, kode: pakke + nr, pakkenavn: p.navn, navn: `${farvenavn} ${form}` };
}
const formSvg = (i) => `<g fill="${i.farve}" stroke="${i.farve}" stroke-width="0">${i.svg}</g>`;

/* Ikonbank. Solide, monokrome ikoner på 24 x 24. Huller laves med evenodd.
   Ikonet vises i appen, mærkets form vises stadig i hjørnet, så man ved, hvad man skal scanne. */
const L = (d) => `<path fill="none" stroke="#1E1D1A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
const IKONER = {
  elkedel: ["Elkedel", '<path d="M7.3 9h9.4l1.3 11H6z"/><rect x="9" y="6.4" width="6" height="2" rx=".8"/><circle cx="12" cy="5.2" r="1.2"/><path d="M7.6 11.6L3.4 8.6l1-1.3 3.6 2.2z"/><path d="M17.2 10.2h1.3a3.6 3.6 0 0 1 0 7.2h-.6l-.2-2.1h.8a1.5 1.5 0 0 0 0-3h-1.1z"/><rect x="5" y="20.4" width="14" height="1.6" rx=".8"/>'],
  wc: ["Toilet", '<rect x="5" y="2.5" width="6.5" height="8" rx="1.2"/><path d="M3.5 11.5H20.5c0 3.5-2.6 6-6 6.4l.6 3.6H8l.6-3.8C5.6 16.9 3.5 14.5 3.5 11.5z"/>'],
  afloeb: ["Afløb", '<path d="M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19zM7.5 7.4h9a1 1 0 0 1 0 2h-9a1 1 0 0 1 0-2zM6.5 11h11a1 1 0 0 1 0 2h-11a1 1 0 0 1 0-2zM7.5 14.6h9a1 1 0 0 1 0 2h-9a1 1 0 0 1 0-2z"/>'],
  vandhane: ["Vandhane", '<rect x="7" y="2.6" width="8" height="2.4" rx="1.2"/><rect x="10" y="4.5" width="2" height="4"/><rect x="2" y="7" width="2.2" height="7" rx=".7"/><path d="M3.5 8.2h10a4.5 4.5 0 0 1 4.5 4.5v2.3h-3.6v-1.8a1.2 1.2 0 0 0-1.2-1.2H3.5z"/><path d="M16.2 17.2s-1.7 2.2-1.7 3.2a1.7 1.7 0 0 0 3.4 0c0-1-1.7-3.2-1.7-3.2z"/>'],
  vask: ["Vaskemaskine", '<path d="M6 2.5h12a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM12 8.3a5.2 5.2 0 1 0 0 10.4a5.2 5.2 0 1 0 0-10.4zM6.6 4.6h3.6a.8.8 0 0 1 0 1.6H6.6a.8.8 0 0 1 0-1.6zM16.6 4.4a1 1 0 1 0 0 2a1 1 0 1 0 0-2z"/><circle cx="12" cy="13.5" r="3.3"/>'],
  opvask: ["Opvaskemaskine", '<path d="M6 2.5h12a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM7 4.4a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM10.2 4.4a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM8.5 8.6h7a.8.8 0 0 1 0 1.6h-7a.8.8 0 0 1 0-1.6zM8 12.6a.8.8 0 0 1 1.6 0v5.6a.8.8 0 0 1-1.6 0zM11.2 12.6a.8.8 0 0 1 1.6 0v5.6a.8.8 0 0 1-1.6 0zM14.4 12.6a.8.8 0 0 1 1.6 0v5.6a.8.8 0 0 1-1.6 0z"/>'],
  seng: ["Seng", '<rect x="2" y="4.5" width="2.6" height="16" rx="1.1"/><rect x="2" y="13.6" width="20" height="4.4" rx="1.2"/><rect x="19.4" y="16" width="2.6" height="4.5" rx=".9"/><rect x="5.6" y="9.6" width="5" height="3.3" rx="1.6"/><path d="M11.6 9h7.4a3 3 0 0 1 3 3v.9H11.6z"/>'],
  roeg: ["Røgalarm", '<path d="M12 2.6a9.4 9.4 0 1 0 0 18.8a9.4 9.4 0 1 0 0-18.8zM12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"/><circle cx="12" cy="12" r="2.6"/><circle cx="17.6" cy="6.4" r="1.4" fill="#fff"/>'],
  emhaette: ["Emhætte", '<rect x="9.3" y="2" width="5.4" height="6.5" rx=".6"/><path d="M8.6 7.8h6.8L21 15.4H3z"/><rect x="3" y="16.2" width="18" height="2" rx=".6"/><circle cx="8" cy="20.6" r="1"/><circle cx="12" cy="20.6" r="1"/><circle cx="16" cy="20.6" r="1"/>'],
  stoevsuger: ["Støvsuger", '<path d="M14.5 9.5h2.8a4.2 4.2 0 0 1 4.2 4.2v3a2 2 0 0 1-2 2h-8.3a2 2 0 0 1-2-2v-3a4.2 4.2 0 0 1 4.2-4.2zM16 12a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4z"/><circle cx="12" cy="19.8" r="1.6"/><circle cx="18.6" cy="19.8" r="1.6"/>' + L("M9.6 14.5C6.5 14.5 6 10 7.6 6.5M7.6 6.5L4.6 18.8") + '<rect x="1.8" y="18.6" width="6" height="2.6" rx="1.3"/>'],
  tandhjul: ["Tandhjul", '<path d="M18.83 9.74L21.41 10.09L21.41 13.91L18.83 14.26L18.43 15.23L20 17.3L17.3 20L15.23 18.43L14.26 18.83L13.91 21.41L10.09 21.41L9.74 18.83L8.77 18.43L6.7 20L4 17.3L5.57 15.23L5.17 14.26L2.59 13.91L2.59 10.09L5.17 9.74L5.57 8.77L4 6.7L6.7 4L8.77 5.57L9.74 5.17L10.09 2.59L13.91 2.59L14.26 5.17L15.23 5.57L17.3 4L20 6.7L18.43 8.77zM15.1 12a3.1 3.1 0 1 0-6.2 0a3.1 3.1 0 1 0 6.2 0z"/>'],
  plante: ["Plante", '<rect x="5.5" y="13" width="13" height="2.4" rx=".7"/><path d="M6.6 15.4h10.8l-1.4 6.1H8z"/><rect x="11.3" y="8" width="1.4" height="5.5"/><path d="M12.6 11.6c0-5 2.6-8 7.6-8.4c0 5-2.6 8-7.6 8.4z"/><path d="M11.4 12C11.4 8.8 9 6.4 4.4 6.4c0 3.5 2.4 5.6 7 5.6z"/>'],
  skrald: ["Skraldespand", '<rect x="3.5" y="5.4" width="17" height="2.4" rx="1.2"/><path d="M9.5 5.6V4a1.2 1.2 0 0 1 1.2-1.2h2.6A1.2 1.2 0 0 1 14.5 4v1.6h-1.6v-1.1h-1.8v1.1z"/><path d="M5.4 8.8h13.2L17.4 20.6a1.6 1.6 0 0 1-1.6 1.4H8.2a1.6 1.6 0 0 1-1.6-1.4zM9.2 11.4a.8.8 0 0 0-.8.8v6a.8.8 0 0 0 1.6 0v-6a.8.8 0 0 0-.8-.8zM12 11.4a.8.8 0 0 0-.8.8v6a.8.8 0 0 0 1.6 0v-6a.8.8 0 0 0-.8-.8zM14.8 11.4a.8.8 0 0 0-.8.8v6a.8.8 0 0 0 1.6 0v-6a.8.8 0 0 0-.8-.8z"/>'],
  koel: ["Køleskab", '<path d="M7.5 2h9a2 2 0 0 1 2 2v7.8h-13V4a2 2 0 0 1 2-2zM8 4.6v3.6a.8.8 0 0 0 1.6 0V4.6A.8.8 0 0 0 8 4.6z"/><path d="M5.5 13.2h13V20a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM8 15.4v3.4a.8.8 0 0 0 1.6 0v-3.4a.8.8 0 0 0-1.6 0z"/>'],
  ovn: ["Ovn", '<path d="M5 3h14a2 2 0 0 1 2 2v2.6H3V5a2 2 0 0 1 2-2zM6.5 4.3a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM10 4.3a1 1 0 1 0 0 2a1 1 0 1 0 0-2z"/><path d="M3 8.8h18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7.5 11.2a1 1 0 0 0-1 1v4.8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4.8a1 1 0 0 0-1-1z"/>'],
  filter: ["Filter", '<path d="M3.6 3.5h16.8a.9.9 0 0 1 .7 1.5l-6.6 7.8v7l-5 2.6v-9.6L2.9 5a.9.9 0 0 1 .7-1.5z"/>'],
  paere: ["Pære", '<path d="M12 2.4a7.1 7.1 0 0 1 4.4 12.7c-.8.6-1.1 1.4-1.1 2.3v.3H8.7v-.3c0-.9-.3-1.7-1.1-2.3A7.1 7.1 0 0 1 12 2.4zM12 5.2a.8.8 0 0 0 0 1.6a2.8 2.8 0 0 1 2.8 2.8a.8.8 0 0 0 1.6 0A4.4 4.4 0 0 0 12 5.2z"/><rect x="8.7" y="18.4" width="6.6" height="1.5" rx=".6"/><rect x="9.6" y="20.4" width="4.8" height="1.6" rx=".8"/>'],
  batteri: ["Batteri", '<path d="M4 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7.7 9v2.2H5.5v1.6h2.2V15h1.6v-2.2h2.2v-1.6H9.3V9zM13.8 11.2a.8.8 0 0 0 0 1.6h2.6a.8.8 0 0 0 0-1.6z"/><rect x="20.6" y="10" width="2" height="4" rx=".7"/>'],
  radiator: ["Radiator", '<rect x="2.6" y="4.5" width="3.6" height="13" rx="1.8"/><rect x="7.2" y="4.5" width="3.6" height="13" rx="1.8"/><rect x="11.8" y="4.5" width="3.6" height="13" rx="1.8"/><rect x="16.4" y="4.5" width="3.6" height="13" rx="1.8"/><rect x="3.4" y="17" width="1.8" height="3.4" rx=".6"/><rect x="17.4" y="17" width="1.8" height="3.4" rx=".6"/><rect x="19.6" y="14" width="2.6" height="1.6" rx=".5"/>'],
  vindue: ["Vindue", '<path d="M5 2.5h14a1.2 1.2 0 0 1 1.2 1.2v17.1H3.8V3.7A1.2 1.2 0 0 1 5 2.5zM5.8 4.4v6.9h5.5V4.4zM12.7 4.4v6.9h5.5V4.4zM5.8 12.7v6.3h5.5v-6.3zM12.7 12.7v6.3h5.5v-6.3z"/><rect x="2.4" y="20.2" width="19.2" height="1.8" rx=".7"/>'],
  bil: ["Bil", '<path d="M3 16.4v-3.1c0-.4.2-.8.5-1.1L6 7.3A2 2 0 0 1 7.8 6h8.4a2 2 0 0 1 1.8 1.3l2.5 4.9c.3.3.5.7.5 1.1v3.1h-1.5a3 3 0 0 0-6 0h-3a3 3 0 0 0-6 0zM8 8l-1.6 3.4h4.8V8zM12.8 8v3.4h4.8L16 8z"/><circle cx="7.5" cy="17" r="2.3"/><circle cx="16.5" cy="17" r="2.3"/>'],
  cykel: ["Cykel", '<path d="M6 11a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM6 13.4a2.6 2.6 0 1 1 0 5.2a2.6 2.6 0 1 1 0-5.2zM18 11a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM18 13.4a2.6 2.6 0 1 1 0 5.2a2.6 2.6 0 1 1 0-5.2z"/>' + L("M6 16l4-7.5h5.5L18 16M10 8.5l3 7.5H6M15.5 8.5L14.5 5.5h2.6M8.5 6.5h3")],
  pote: ["Kæledyr", '<ellipse cx="8.6" cy="6" rx="2.1" ry="2.6"/><ellipse cx="15.4" cy="6" rx="2.1" ry="2.6"/><ellipse cx="4.6" cy="11" rx="1.9" ry="2.3"/><ellipse cx="19.4" cy="11" rx="1.9" ry="2.3"/><path d="M12 10.8c-3.2 0-6 3.6-6 6.1c0 2.3 2.2 3.4 6 2.3c3.8 1.1 6-0 6-2.3c0-2.5-2.8-6.1-6-6.1z"/>'],
  tandboerste: ["Tandbørste", '<g transform="rotate(-40 12 12)"><rect x="1" y="13.4" width="15" height="3" rx="1.5"/><rect x="14" y="13.4" width="8.6" height="3" rx="1"/><path d="M14.6 8h7.4v4.6h-7.4zM16.4 9v2.6h1V9zM18.8 9v2.6h1V9z"/></g>']
};
const FORSLAG_IKON = { Elkedel: "elkedel", Afløb: "afloeb", Vaskemaskine: "vask", Sengetøj: "seng", Røgalarm: "roeg", Emhætte: "emhaette", Støvsugerfilter: "stoevsuger", Opvaskemaskine: "opvask" };
const ikonSti = (k) => `<g fill="#1E1D1A" fill-rule="evenodd">${IKONER[k][1]}</g>`;
function ikonSvg(k, cls = "ikon-lille") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IKONER[k] ? ikonSti(k) : ""}</svg>`;
}
// Uden ikon: mærket, som det ser ud. Med ikon: ikonet i midten og mærket i hjørnet.
function symbolSvg(tagId, cls = "sym", ikon = null) {
  const i = maerkeInfo(tagId);
  if (ikon && IKONER[ikon]) {
    const bund = '<circle cx="50" cy="50" r="48" fill="#fff" stroke="#E3DDCC" stroke-width="1.5"/>';
    const hjoerne = i ? `<circle cx="78" cy="78" r="24" fill="${i.bund}" stroke="${i.pakke === "B" ? "#fff" : "#E3DDCC"}" stroke-width="2"/><g transform="translate(60.5 60.5) scale(.35)">${formSvg(i)}</g>` : "";
    return `<svg class="${cls}" viewBox="-2 -2 106 106" aria-hidden="true">${bund}<g transform="translate(19 17) scale(2.3)">${ikonSti(ikon)}</g>${hjoerne}</svg>`;
  }
  const bund = `<circle cx="50" cy="50" r="48" fill="${i ? i.bund : "#fff"}" stroke="${i ? i.kant : "#E3DDCC"}" stroke-width="1.5"/>`;
  const form = i ? `<g transform="translate(25 25) scale(.5)">${formSvg(i)}</g>` : '<circle cx="50" cy="46" r="18" fill="#A39B88"/>';
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${bund}${form}</svg>`;
}

/* ---------- Tid ---------- */
const dagStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dageMellem = (a, b) => Math.round((dagStart(a) - dagStart(b)) / DAG);
const dato = (t) => { const d = new Date(t); return `${d.getDate()}. ${MDR[d.getMonth()]}`; };
const isoDato = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Valgt dato bliver kl. 12 den dag. Er det i dag, bruges tidspunktet lige nu.
function fraIsoDato(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
  return dagStart(t) === dagStart(Date.now()) ? Date.now() : t;
}
// Hvornår blev det sidst gjort ifølge formularen? null betyder "ved ikke".
function formSidst(f) {
  if (f.sidst === "i-dag") return Date.now();
  if (f.sidst === "dato") {
    if (f.ret && f.opgave?.lastDone && f.sidstDato === isoDato(f.opgave.lastDone)) return f.opgave.lastDone;
    return fraIsoDato(f.sidstDato);
  }
  return null;
}
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
  husstand() { return this.data ? { navn: this.data.navn, invitation: this.data.invitation, multi: !!this.data.multi, points: !!this.data.points } : null; }
  async opdaterHusstand(patch) { Object.assign(this.data, patch); this.gemNu(); }
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
  // Fylder demoen med en husstand og nogle opgaver i forskellige stadier, så der er noget at se på.
  fyldDemo() {
    const nu = Date.now(), d = (n) => nu - n * DAG;
    const opg = (id, name, place, num, unit, sidst, by, owner) => ({
      id, name, place, num, unit, owner, icon: null, createdAt: d(120), lastNotified: null,
      lastDone: sidst, lastBy: sidst ? by : null, history: sidst ? [{ at: sidst, by }] : [], dueAt: sidst ? laegTil(sidst, num, unit) : nu
    });
    const liste = [
      opg("A1-DEMO", "Afkalk elkedel", "Køkken", 1, "m", d(34), "anna", null),
      opg("A2-DEMO", "Skift sengetøj", "Soveværelse", 2, "w", d(11), "demo", "demo"),
      opg("A3-DEMO", "Rens afløb", "Badeværelse", 1, "m", d(27), "ida", "ida"),
      opg("A4-DEMO", "Test røgalarm", "Gang", 3, "m", d(40), "demo", null),
      opg("A5-DEMO", "Rens emhættefilter", "Køkken", 3, "m", d(70), "anna", "anna"),
      opg("A6-DEMO", "Vand planterne", "Stue", 1, "w", d(2), "ida", null),
      { ...opg("B2-DEMO", "Rens filter", "Køkken", 1, "m", d(33), "anna", null), tag: "B2-DEMO", icon: "opvask" },
      { ...opg("B2-DEMO_SALT", "Fyld salt på", "Køkken", 2, "m", d(20), "demo", null), tag: "B2-DEMO", icon: "opvask" },
      { ...opg("B2-DEMO_AFSP", "Fyld afspændingsmiddel", "Køkken", 3, "m", d(64), "ida", null), tag: "B2-DEMO", icon: "opvask" }
    ];
    this.data = { navn: "Demohjemmet", invitation: "DEMO00", multi: true, opgaver: Object.fromEntries(liste.map((o) => [o.id, o])),
      medlemmer: { demo: { name: "Dig" }, anna: { name: "Anna" }, ida: { name: "Ida" } } };
    this.gemNu();
  }
}
const iDemo = () => hent("plejer-tilstand") === "demo";
function startDemo() {
  gem("plejer-tilstand", "demo");
  const l = new DemoLager(); l.fyldDemo();
  location.replace(location.pathname);
}
function afslutDemo() {
  try { localStorage.removeItem("plejer-tilstand"); localStorage.removeItem("plejer-demo"); } catch (e) {}
  location.replace(location.pathname);
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
  husstand() { return this._husstand ? { navn: this._husstand.name, invitation: this._husstand.invite, multi: !!this._husstand.multi, points: !!this._husstand.points } : null; }
  async opdaterHusstand(patch) { const { doc, updateDoc } = this.fs; await updateDoc(doc(this.db, "households", this.hid), patch); }
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
const S = { lager: null, visning: "henter", data: null, scan: null, lyd: false, sidste: null, slet: false,
  sorter: hent("plejer-sorter") || "frist", filter: hent("plejer-filter") || "alle" };

/* ---------- Visninger ---------- */
function personNavn(uid) {
  if (!uid) return "";
  if (uid === S.lager.uid) return "dig";
  return S.lager.medlemmer()[uid]?.name || "en anden";
}
// Pointtilstanden (konkurrence i husstanden) har ingen hovedansvarlig. Slås til pr. husstand.
const pointTilstand = () => !!S.lager.husstand()?.points;
const visAnsvar = () => !pointTilstand();
// Flere opgaver på samme mærke. Slås til pr. husstand under indstillinger.
const flereTilladt = () => !!S.lager.husstand()?.multi;
const opgaverPaa = (tag) => S.lager.opgaver().filter((o) => tagAf(o) === tag);
// Minutter siden sidste registrering, hvis det er under 10 minutter. Ellers 0.
function lige(o) { const m = o.lastDone ? Math.floor((Date.now() - o.lastDone) / 6e4) : Infinity; return m < 10 ? Math.max(1, m) : 0; }
function ansvarNavn(o) {
  if (!visAnsvar() || !o.owner) return "";
  return o.owner === S.lager.uid ? "dig" : S.lager.medlemmer()[o.owner]?.name || "en tidligere";
}
const SORTERINGER = [["frist", "Frist"], ["navn", "Navn"], ["sted", "Sted"], ["ansvar", "Ansvarlig"], ["maerke", "Mærke"]];
const alfa = (a, b) => String(a || "").localeCompare(String(b || ""), "da", { sensitivity: "base" });
function filterValg() {
  const v = [["alle", "Alle opgaver"], ["over", "Over tid"], ["uge", "Over tid og denne uge"]];
  const p = [], st = [];
  if (visAnsvar()) {
    v.push(["mine", "Mit ansvar"], ["ingen", "Uden ansvarlig"]);
    for (const [uid, m] of Object.entries(S.lager.medlemmer())) if (uid !== S.lager.uid) p.push(["p:" + uid, m.name]);
  }
  for (const sted of [...new Set(S.lager.opgaver().map((o) => (o.place || "").trim()).filter(Boolean))].sort(alfa)) st.push(["s:" + sted, sted]);
  return { v, p, st };
}
function passer(x) {
  const f = S.filter, o = x.o;
  if (f === "over") return x.s.over;
  if (f === "uge") return x.s.over || x.s.d <= 6;
  if (f === "mine") return o.owner === S.lager.uid;
  if (f === "ingen") return !o.owner;
  if (f.startsWith("p:")) return o.owner === f.slice(2);
  if (f.startsWith("s:")) return (o.place || "").trim() === f.slice(2);
  return true;
}
function vaelgere(antal, vist) {
  const { v, p, st } = filterValg();
  const sort = SORTERINGER.filter(([k]) => k !== "ansvar" || visAnsvar());
  const opt = (k, n) => `<option value="${esc(k)}"${S.filter === k ? " selected" : ""}>${esc(n)}</option>`;
  return `<div class="vaelg">
    <label><span>Sortér</span><select id="sorter">${sort.map(([k, n]) => `<option value="${k}"${S.sorter === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
    <label><span>Vis</span><select id="filter">${v.map(([k, n]) => opt(k, n)).join("")}${p.length ? `<optgroup label="Ansvarlig">${p.map(([k, n]) => opt(k, n)).join("")}</optgroup>` : ""}${st.length ? `<optgroup label="Sted">${st.map(([k, n]) => opt(k, n)).join("")}</optgroup>` : ""}</select></label>
  </div>${vist < antal ? `<p class="viser">Viser ${vist} af ${antal} <button class="link" data-handling="nulstil">Vis alle</button></p>` : ""}`;
}
function sektion(titel, liste) {
  return liste.length ? `<section class="liste"><h2 class="sek">${esc(titel)}</h2><div class="gruppe">${liste.map((x) => raekke(x.o)).join("")}</div></section>` : "";
}
function grupper(liste, noegle, tomNavn) {
  const g = new Map();
  for (const x of liste) { const k = noegle(x) || ""; if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
  return [...g.keys()].sort((a, b) => (a === "") - (b === "") || alfa(a, b)).map((k) => sektion(k || tomNavn, g.get(k))).join("");
}
function raekke(o) {
  const s = status(o);
  return `<button class="raekke ${s.klasse}" data-handling="vis" data-id="${esc(o.id)}">
    ${symbolSvg(tagAf(o), "sym", o.icon)}
    <span class="midt"><b>${esc(o.name)}</b><span class="bar"><i style="width:${s.pct.toFixed(1)}%"></i></span></span>
    <span class="frist">${esc(s.tekst)}</span>
  </button>`;
}
function visStart() {
  const demo = S.lager.demo;
  return `<div class="start">
    <div class="logo"><img src="../ikon.svg" alt="">Plejer</div>
    <p class="lead">Plejer husker det, du plejer at glemme. Opret jeres husstand, eller deltag i en, der findes.</p>
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
    ${demo ? "" : `<div class="kort"><h2>Bare se, hvordan det virker?</h2><p class="daempet">Demoen har en husstand med opgaver i forvejen. Intet bliver gemt i skyen, og du kan afslutte den igen.</p><button class="knap sek bred" data-handling="demo">Prøv demoen</button></div>`}
  </div>`;
}
function visHjem() {
  const h = S.lager.husstand() || { navn: "Hjemmet" };
  const alle = S.lager.opgaver().map((o) => ({ o, s: status(o) })).sort((a, b) => a.s.frist - b.s.frist);
  const over = alle.filter((x) => x.s.over), uge = alle.filter((x) => !x.s.over && x.s.d <= 6), senere = alle.filter((x) => !x.s.over && x.s.d > 6);
  // Et valgt filter eller en sortering, der ikke længere findes, falder tilbage til standard.
  const { v, p, st } = filterValg();
  if (![...v, ...p, ...st].some(([k]) => k === S.filter)) S.filter = "alle";
  if (S.sorter === "ansvar" && !visAnsvar()) S.sorter = "frist";
  const vist = alle.filter(passer);
  const lydKnap = over.length ? `<button class="ikonknap${S.lyd ? " til" : ""}" data-handling="lyd" aria-label="${S.lyd ? "Slå lyd fra" : "Slå lyd til"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>${S.lyd ? "" : '<path d="M3 3l18 18"/>'}</svg></button>` : "";
  const naeste = alle.find((x) => !x.s.over);
  const sum = !alle.length ? "Ingen opgaver endnu" : over.length ? `<span class="over">${over.length} over tid</span>` : naeste ? `Alt er klaret. Næste: ${esc(naeste.o.name.toLowerCase())} ${esc(naeste.s.tekst.toLowerCase())}` : "";
  let html = `<header class="top"><div><h1>${esc(h.navn)}</h1><div class="sum">${sum}</div></div>
    <div class="top-knapper">${lydKnap}<button class="ikonknap" data-handling="indstillinger" aria-label="Husstand og indstillinger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></button></div></header>`;
  if (S.lager.demo) html += S.firebase
    ? '<p class="demo-linje">Demo. Gemmes kun på denne telefon. <button class="link" data-handling="afslut-demo">Afslut</button></p>'
    : '<p class="demo-linje">Demo. Gemmes kun på denne telefon.</p>';
  if (!alle.length) {
    html += `<div class="kort"><h2>Scan jeres første mærke</h2><p class="daempet">Hold telefonen hen til et Plejer-mærke. Så spørger appen, hvad det skal huske.</p></div>`;
  }
  if (S.filter !== "alle" || S.sorter !== "frist") {
    const { v, p, st } = filterValg(), navn = [...v, ...p, ...st].find(([k]) => k === S.filter)?.[1];
    html += `<p class="viser">${S.filter !== "alle" ? esc(navn) + " · " : ""}${S.sorter !== "frist" ? "sorteret efter " + esc(SORTERINGER.find(([k]) => k === S.sorter)[1].toLowerCase()) + " · " : ""}<button class="link" data-handling="nulstil">Nulstil</button></p>`;
  }
  if (alle.length && !vist.length) html += '<div class="kort"><p class="daempet">Ingen opgaver passer til det valgte.</p></div>';
  if (S.sorter !== "frist") {
    if (S.sorter === "navn") html += sektion("Alle opgaver", [...vist].sort((a, b) => alfa(a.o.name, b.o.name)));
    else if (S.sorter === "maerke") html += sektion("Efter mærke", [...vist].sort((a, b) => a.o.id.localeCompare(b.o.id)));
    else if (S.sorter === "sted") html += grupper(vist, (x) => (x.o.place || "").trim(), "Uden sted");
    else if (S.sorter === "ansvar") html += grupper(vist, (x) => ansvarNavn(x.o).replace(/^dig$/, "Dig"), "Ingen ansvarlig");
    return html + bundKnapper(alle.length);
  }
  const vOver = over.filter(passer), vUge = uge.filter(passer), vSenere = senere.filter(passer);
  html += sektion("Over tid", vOver);
  html += sektion("Denne uge", vUge);
  if (vSenere.length) html += S.visSenere ? sektion("Senere", vSenere)
    : `<button class="flere" data-handling="senere">${vSenere.length} ${vSenere.length === 1 ? "opgave" : "opgaver"} senere</button>`;
  return html + bundKnapper(alle.length);
}
function bundKnapper(antal = 0) {
  let html = '<div class="bund-knapper">';
  if ("NDEFReader" in window) html += '<button class="knap bred" data-handling="nfc">Scan mærke</button>';
  else html += '<p class="daempet" style="text-align:center;font-size:15px">Hold telefonen hen til et mærke for at scanne.</p>';
  if (S.lager.demo) html += '<button class="knap sek bred" data-handling="proev">Prøv et mærke</button>';
  if (antal > 1) html += '<button class="link" data-handling="sorter-ark">Sortér og filtrér</button>';
  html += "</div>";
  return html;
}
function visNyt() {
  const f = S.data, info = maerkeInfo(f.tag);
  const andre = S.lager.opgaver().filter((o) => tagAf(o) === f.tag && o.id !== f.id);
  const sidst = formSidst(f), frist = sidst ? laegTil(sidst, f.num, f.unit) : Date.now();
  const forsinket = sidst && frist <= Date.now();
  return `<div class="maerke-top">
      <span class="etiket">${f.ret ? "Ret opgave" : andre.length ? "Ny opgave på mærket" : "Nyt mærke fundet"}</span>
      ${symbolSvg(f.tag, "stor", f.icon)}
      <span class="navn">${esc(info.navn)}</span><span class="mono daempet">${f.icon ? "Scannes på dette mærke · " : ""}${esc(info.kode)}</span>
      ${andre.length ? `<p class="daempet">Mærket har også: ${andre.map((o) => esc(o.name)).join(", ")}</p>` : ""}
    </div>
    <form id="nyt-form" class="kort">
      <div class="felt"><label for="o-navn">Hvad skal den huske?</label><input id="o-navn" maxlength="50" value="${esc(f.name)}" placeholder="Afkalk elkedel" required></div>
      <div class="chips">${FORSLAG.map((n) => `<button type="button" class="chip" data-handling="forslag" data-v="${esc(n)}" aria-pressed="${f.name === n}">${esc(n)}</button>`).join("")}</div>
      <div class="felt"><label for="o-sted">Hvor (valgfrit)</label><input id="o-sted" maxlength="40" value="${esc(f.place)}" placeholder="Køkken"></div>
      <div class="felt"><span class="etiket">Ikon i appen</span>
        <div class="ikoner"><button type="button" data-handling="ikon" data-v="" aria-pressed="${!f.icon}" aria-label="Mærkets form">${symbolSvg(f.tag, "ikon-lille")}</button>${Object.entries(IKONER).map(([k, [navn]]) => `<button type="button" data-handling="ikon" data-v="${k}" aria-pressed="${f.icon === k}" aria-label="${esc(navn)}" title="${esc(navn)}">${ikonSvg(k)}</button>`).join("")}</div>
        <p class="hjaelp">Mærkets form bliver ved med at stå i hjørnet, så man kan se, hvilket mærke der skal scannes.</p></div>
      <div class="felt"><span class="etiket">Hvor tit?</span>
        <div class="seg">${INTERVALLER.map((iv, k) => `<button type="button" data-handling="interval" data-k="${k}" aria-pressed="${!f.andet && iv.num === f.num && iv.enhed === f.unit}">${iv.navn}</button>`).join("")}<button type="button" data-handling="andet" aria-pressed="${f.andet}">Andet</button></div>
      </div>
      ${f.andet ? `<div class="raek"><div class="felt"><label for="o-num">Hver</label><input id="o-num" type="number" inputmode="numeric" min="1" max="99" value="${f.num}"></div>
        <div class="felt"><label for="o-enhed">Enhed</label><select id="o-enhed"><option value="d"${f.unit === "d" ? " selected" : ""}>dag</option><option value="w"${f.unit === "w" ? " selected" : ""}>uge</option><option value="m"${f.unit === "m" ? " selected" : ""}>måned</option></select></div></div>` : ""}
      <div class="felt"><span class="etiket">Sidst gjort</span>
        <div class="seg"><button type="button" data-handling="sidst" data-v="i-dag" aria-pressed="${f.sidst === "i-dag"}">I dag</button><button type="button" data-handling="sidst" data-v="dato" aria-pressed="${f.sidst === "dato"}">Vælg dato</button><button type="button" data-handling="sidst" data-v="ved-ikke" aria-pressed="${f.sidst === "ved-ikke"}">Ved ikke</button></div>
      </div>
      ${f.sidst === "dato" ? `<div class="felt"><label for="o-dato">Dato</label><input id="o-dato" type="date" value="${esc(f.sidstDato || "")}" max="${isoDato(Date.now())}" required></div>` : ""}
      ${visAnsvar() ? `<div class="felt"><span class="etiket">Hovedansvarlig</span>
        <div class="chips"><button type="button" class="chip" data-handling="ansvar" data-v="" aria-pressed="${!f.owner}">Ingen</button>${Object.entries(S.lager.medlemmer()).map(([uid, m]) => `<button type="button" class="chip" data-handling="ansvar" data-v="${esc(uid)}" aria-pressed="${f.owner === uid}">${esc(m.name)}${uid === S.lager.uid ? " (dig)" : ""}</button>`).join("")}</div>
        <p class="hjaelp">Alle kan stadig scanne. Den ansvarlige har bare hovedansvaret.</p></div>` : ""}
      <p class="daempet">${f.ret ? "Næste påmindelse" : "Første påmindelse"}: <b style="color:var(--blaek)">${!sidst || forsinket ? "med det samme" : dato(frist)}</b></p>
      <button class="knap bred" type="submit">${f.ret ? "Gem" : "Gem og start nedtælling"}</button>
      <button class="link" type="button" data-handling="hjem">Annullér</button>
    </form>`;
}
function visKlaret() {
  const opg = S.data.ids.map((id, k) => S.lager.opgaver().find((x) => x.id === id) || S.data.opgaver[k]);
  const o = opg[0], s = status(o), dage = Math.max(0, dageMellem(s.frist, Date.now()));
  const historik = (o.history || []).slice(0, 4);
  const flere = opg.length > 1;
  const tilfoej = flereTilladt() && !S.data.allerede ? `<button class="link" data-handling="tilfoej" data-tag="${esc(tagAf(o))}">Læg en opgave mere på mærket</button>` : "";
  return `<div class="maerke-top">
      <span class="etiket">Mærke scannet · ${new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</span>
      ${symbolSvg(tagAf(o), "stor", o.icon)}
      <span class="klaret-ord">${S.data.allerede ? "Allerede" : "Klaret"}</span>
      ${flere ? "" : `<b style="font-size:22px">${esc(o.name)}</b>`}
    </div>
    ${S.data.allerede ? `<div class="banner note"><p>Den blev registreret for ${S.data.allerede} min. siden af ${esc(personNavn(o.lastBy))}. Der er ikke talt dobbelt.</p></div>` : ""}
    ${flere
      ? `<div class="kort klaret-liste">${opg.map((x) => { const st = status(x), n = Math.max(0, dageMellem(st.frist, Date.now())); return `<div><b>${esc(x.name)}</b><span class="daempet">${n} ${n === 1 ? "dag" : "dage"} til næste gang</span></div>`; }).join("")}</div>`
      : `<div class="tal"><b>${dage}</b><div><b style="font-family:var(--sans);font-size:17px">${dage === 1 ? "dag" : "dage"} til næste gang</b><div class="daempet">${UGEDAGE[new Date(s.frist).getDay()]} ${dato(s.frist)} ${new Date(s.frist).getFullYear()}</div></div></div>`}
    ${S.lager.demo ? "" : `<p class="daempet">Påmindelsen er stoppet for hele husstanden.</p>`}
    ${!flere && historik.length ? `<div><span class="etiket">Sidste gange</span><div class="historik">${historik.map((h) => `<div><span>${dato(h.at)} ${new Date(h.at).getFullYear()}</span><span class="daempet">${esc(personNavn(h.by))}</span></div>`).join("")}</div></div>` : ""}
    <div class="raek">${S.sidste && !S.data.allerede ? '<button class="knap sek" data-handling="fortryd">Fortryd</button>' : ""}<button class="knap" data-handling="hjem">Færdig</button></div>
    ${tilfoej}`;
}
// Mærket har flere opgaver: vælg hvad der er gjort.
function visVaelg() {
  const f = S.data, info = maerkeInfo(f.tag);
  const liste = opgaverPaa(f.tag).map((o) => ({ o, s: status(o), lige: lige(o) })).sort((a, b) => a.s.frist - b.s.frist);
  const antal = liste.filter((x) => f.valgt.includes(x.o.id)).length;
  return `<div class="maerke-top">
      <span class="etiket">Mærke scannet</span>
      ${symbolSvg(f.tag, "stor", liste[0]?.o.icon)}
      <span class="navn">${esc(info.navn)}</span>
    </div>
    <div class="kort">
      <h2>Hvad har du gjort?</h2>
      <div class="valg">${liste.map(({ o, s: st, lige: l }) => `<button type="button" class="valg-raekke ${st.klasse}" data-handling="vaelg" data-id="${esc(o.id)}" aria-pressed="${f.valgt.includes(o.id)}" ${l ? "disabled" : ""}>
        <span class="flueben" aria-hidden="true"></span>
        <span class="midt"><b>${esc(o.name)}</b><span class="hvor">${l ? `Gjort for ${l} min. siden af ${esc(personNavn(o.lastBy))}` : esc(intervalTekst(o.num, o.unit))}</span></span>
        <span class="frist">${esc(st.tekst)}</span></button>`).join("")}</div>
      <button class="knap bred" data-handling="registrer-valgte" ${antal ? "" : "disabled"}>${antal > 1 ? `Registrér ${antal} opgaver` : "Registrér"}</button>
      ${flereTilladt() ? `<button class="knap sek bred" data-handling="tilfoej" data-tag="${esc(f.tag)}">Læg en opgave mere på mærket</button>` : ""}
      <button class="link" type="button" data-handling="hjem">Annullér</button>
    </div>`;
}
function render() {
  const app = $("app");
  if (S.visning === "henter") { app.innerHTML = '<div class="tom"><p>Henter Plejer…</p></div>'; return; }
  if (S.visning === "fejl") { app.innerHTML = `<div class="tom"><p>${esc(S.data)}</p></div>`; return; }
  app.innerHTML = S.visning === "start" ? visStart() : S.visning === "nyt" ? visNyt() : S.visning === "klaret" ? visKlaret() : S.visning === "vaelg" ? visVaelg() : visHjem();
}

/* ---------- Ark ---------- */
function lukArk() { $("ark").innerHTML = ""; S.slet = false; }
function aabnArk(html) {
  $("ark").innerHTML = `<div class="skygge" data-handling="luk"></div><div class="ark" role="dialog" aria-modal="true"><div class="ark-indre">${html}</div></div>`;
}
function visOpgaveArk(id) {
  const o = S.lager.opgaver().find((x) => x.id === id); if (!o) return;
  const s = status(o);
  const andre = opgaverPaa(tagAf(o)).filter((x) => x.id !== o.id);
  aabnArk(`<div style="display:flex;gap:14px;align-items:center">${symbolSvg(tagAf(o), "sym", o.icon)}<div><h2>${esc(o.name)}</h2><p class="daempet">${o.place ? esc(o.place) + " · " : ""}${esc(intervalTekst(o.num, o.unit))}${ansvarNavn(o) ? " · ansvar: " + esc(ansvarNavn(o)) : ""}</p></div></div>
    <p>Næste gang: <b>${dato(s.frist)}</b> (${esc(s.tekst.toLowerCase())})</p>
    ${ansvarNavn(o) ? `<p>Hovedansvarlig: <b>${esc(ansvarNavn(o) === "dig" ? "Dig" : ansvarNavn(o))}</b></p>` : ""}
    ${(o.history || []).length ? `<div class="historik">${o.history.slice(0, 5).map((h) => `<div><span>${dato(h.at)}</span><span class="daempet">${esc(personNavn(h.by))}</span></div>`).join("")}</div>` : ""}
    <button class="knap bred" data-handling="klaret-nu" data-id="${esc(o.id)}">Klaret nu</button>
    <div class="raek"><button class="knap sek" data-handling="ret" data-id="${esc(o.id)}">Ret</button><button class="knap sek" data-handling="slet" data-id="${esc(o.id)}">Slet</button></div>
    ${andre.length ? `<p class="daempet">Samme mærke: ${andre.map((x) => esc(x.name)).join(", ")}</p>` : ""}
    ${flereTilladt() ? `<button class="link" data-handling="tilfoej" data-tag="${esc(tagAf(o))}">Læg en opgave mere på mærket</button>` : ""}`);
}
function visIndstillinger() {
  const h = S.lager.husstand(), m = S.lager.medlemmer();
  aabnArk(`<h2>${esc(h?.navn || "Husstand")}</h2>
    ${S.lager.demo ? `<p class="daempet">${S.firebase ? "Det her er en demo. Afslut den for at oprette jeres egen husstand og invitere resten med en kode." : "Demotilstand. Når appen er koblet til Firebase, kan resten af husstanden deltage med en kode."}</p>` : `<span class="etiket">Kode til resten af husstanden</span><div class="kode" id="kode-vis">${esc(h?.invitation || "")}</div><button class="knap sek bred" data-handling="kopier">Kopiér koden</button>`}
    <span class="etiket">Indstillinger</span>
    <button class="kontakt" role="switch" aria-checked="${!!h?.multi}" data-handling="multi"><span><b>Flere opgaver på ét mærke</b><span class="daempet">Fx filter, salt og afspændingsmiddel på opvaskemaskinen. Når mærket scannes, vælger man, hvad man har gjort.</span></span><i aria-hidden="true"></i></button>
    <span class="etiket">Medlemmer</span><div class="medlemmer">${Object.entries(m).map(([uid, x]) => `<div><span>${esc(x.name)}</span><span class="daempet">${uid === S.lager.uid ? "dig" : ""}</span></div>`).join("")}</div>
    ${S.lager.demo ? "" : `<button class="knap bred" data-handling="push">${hent("plejer-push") ? "Påmindelser er slået til" : "Slå påmindelser til"}</button>`}
    ${S.lager.demo && S.firebase ? '<button class="knap bred" data-handling="afslut-demo">Afslut demoen</button>' : '<button class="knap sek bred" data-handling="forlad">Forlad husstanden</button>'}
    <button class="link" data-handling="luk">Luk</button>`);
}

/* ---------- Handlinger ---------- */
// Registrerer en eller flere opgaver som gjort nu. Et scan inden for 10 minutter tæller ikke dobbelt.
async function registrer(liste, kilde) {
  const o0 = liste[0];
  if (kilde === "scan" && liste.length === 1 && lige(o0)) { S.sidste = null; S.visning = "klaret"; S.data = { ids: [o0.id], opgaver: [o0], allerede: lige(o0) }; render(); return; }
  const nu = Date.now(), backup = [], nye = [];
  try {
    for (const o of liste) {
      backup.push({ id: o.id, lastDone: o.lastDone || null, lastBy: o.lastBy || null, history: o.history || [], dueAt: o.dueAt || null });
      const history = [{ at: nu, by: S.lager.uid }, ...(o.history || [])].slice(0, 10);
      const patch = { lastDone: nu, lastBy: S.lager.uid, history, dueAt: laegTil(nu, o.num, o.unit), lastNotified: null };
      await S.lager.opdaterOpgave(o.id, patch);
      nye.push({ ...o, ...patch });
    }
  } catch (e) { besked("Kunne ikke gemme. Tjek forbindelsen."); if (!nye.length) return; }
  S.sidste = backup.slice(0, nye.length);
  ding();
  S.visning = "klaret"; S.data = { ids: nye.map((o) => o.id), opgaver: nye }; render();
}
async function haandterScan(rå) {
  let id = String(rå || "").toUpperCase().trim();
  const m = /([AB][1-8]-[A-Z0-9]{4})/.exec(id); id = m ? m[1] : id;
  if (!maerkeInfo(id)) { besked("Det mærke kender Plejer ikke."); return; }
  if (S.lager.opgaverKlar) await Promise.race([S.lager.opgaverKlar, new Promise((ok) => setTimeout(ok, 6000))]);
  lukArk();
  const liste = opgaverPaa(id);
  if (liste.length === 1) return registrer(liste, "scan");
  if (liste.length > 1) {
    // Det der er over tid, er valgt på forhånd. Det man lige har gjort, kan ikke vælges.
    S.visning = "vaelg"; S.data = { tag: id, valgt: liste.filter((o) => status(o).over && !lige(o)).map((o) => o.id) }; render(); return;
  }
  nyOpgave(id, id);
}
function nyOpgave(tag, id) {
  S.visning = "nyt"; S.data = { id, tag, name: "", place: "", num: 1, unit: "m", andet: false, sidst: "i-dag", owner: null, icon: null };
  // En ekstra opgave på samme mærke arver ikon og sted fra den første.
  const foerste = opgaverPaa(tag)[0];
  if (foerste) Object.assign(S.data, { icon: foerste.icon || null, ikonValgt: !!foerste.icon, place: foerste.place || "" });
  render(); scrollTo(0, 0);
}
function laesForm() {
  const f = S.data; if (!f) return;
  const n = $("o-navn"), p = $("o-sted"), num = $("o-num"), en = $("o-enhed"), dt = $("o-dato");
  if (n) f.name = n.value; if (p) f.place = p.value; if (dt) f.sidstDato = dt.value;
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
  if (h === "demo") return startDemo();
  if (h === "afslut-demo") return afslutDemo();
  if (h === "hjem") { lukArk(); S.visning = "hjem"; S.data = null; return render(); }
  if (h === "vis") return visOpgaveArk(id);
  if (h === "senere") { S.visSenere = true; return render(); }
  if (h === "sorter-ark") { const n = S.lager.opgaver().length; return aabnArk(`<h2>Sortér og filtrér</h2>${vaelgere(n, n)}<button class="knap bred" data-handling="luk">Færdig</button>`); }
  if (h === "indstillinger") return visIndstillinger();
  if (h === "nfc") return scanNfc();
  if (h === "proev") {
    const brugt = new Set(S.lager.opgaver().map((o) => tagAf(o).slice(0, 2)));
    const kode = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "B1", "B2", "B3", "B4"].find((k) => !brugt.has(k)) || "A1";
    return haandterScan(`${kode}-${tilfaeldig(4)}`);
  }
  if (h === "forslag") { laesForm(); S.data.name = el.dataset.v; if (!S.data.ikonValgt && FORSLAG_IKON[el.dataset.v]) S.data.icon = FORSLAG_IKON[el.dataset.v]; render(); return; }
  if (h === "ikon") { laesForm(); S.data.icon = el.dataset.v || null; S.data.ikonValgt = true; render(); return; }
  if (h === "interval") { laesForm(); const iv = INTERVALLER[+el.dataset.k]; Object.assign(S.data, { num: iv.num, unit: iv.enhed, andet: false }); render(); return; }
  if (h === "andet") { laesForm(); S.data.andet = true; render(); return; }
  if (h === "ansvar") { laesForm(); S.data.owner = el.dataset.v || null; render(); return; }
  if (h === "nulstil") { S.filter = "alle"; gem("plejer-filter", "alle"); return render(); }
  if (h === "sidst") {
    laesForm(); S.data.sidst = el.dataset.v;
    if (S.data.sidst === "dato" && !S.data.sidstDato) S.data.sidstDato = isoDato(Date.now() - DAG);
    render();
    if (S.data.sidst === "dato") { const d = $("o-dato"); try { d?.showPicker?.(); } catch (e) {} }
    return;
  }
  if (h === "klaret-nu") { const o = S.lager.opgaver().find((x) => x.id === id); lukArk(); if (o) await registrer([o], "knap"); return; }
  if (h === "vaelg") { const v = S.data.valgt; S.data.valgt = v.includes(id) ? v.filter((x) => x !== id) : [...v, id]; return render(); }
  if (h === "registrer-valgte") { const liste = opgaverPaa(S.data.tag).filter((o) => S.data.valgt.includes(o.id) && !lige(o)); if (liste.length) await registrer(liste, "valg"); return; }
  if (h === "tilfoej") { lukArk(); S.sidste = null; return nyOpgave(el.dataset.tag, `${el.dataset.tag}_${tilfaeldig(4)}`); }
  if (h === "multi") {
    const til = !flereTilladt();
    try { await S.lager.opdaterHusstand({ multi: til }); besked(til ? "Flere opgaver på ét mærke er slået til" : "Slået fra. Mærker med flere opgaver beholder dem."); } catch (e) { besked("Kunne ikke gemme indstillingen."); }
    return visIndstillinger();
  }
  if (h === "ret") {
    const o = S.lager.opgaver().find((x) => x.id === id); lukArk(); if (!o) return;
    S.visning = "nyt"; S.data = { id: o.id, tag: tagAf(o), name: o.name, place: o.place || "", num: o.num, unit: o.unit, andet: !INTERVALLER.some((iv) => iv.num === o.num && iv.enhed === o.unit), sidst: o.lastDone ? "dato" : "ved-ikke", sidstDato: o.lastDone ? isoDato(o.lastDone) : "", owner: o.owner || null, icon: o.icon || null, ikonValgt: !!o.icon, ret: true, opgave: o };
    return render();
  }
  if (h === "slet") {
    if (!S.slet) { S.slet = true; el.textContent = "Tryk igen for at slette"; el.classList.replace("sek", "fare"); return; }
    const o = S.lager.opgaver().find((x) => x.id === id);
    try { await S.lager.sletOpgave(id); besked(o && opgaverPaa(tagAf(o)).length ? "Opgaven er slettet." : "Opgaven er slettet. Mærket kan bruges igen."); } catch (e) { besked("Kunne ikke slette."); }
    return lukArk();
  }
  if (h === "fortryd") {
    const a = S.sidste; S.sidste = null; if (!a) return;
    try { for (const { id: oid, ...gammel } of a) await S.lager.opdaterOpgave(oid, gammel); besked(a.length > 1 ? "Registreringerne er fortrudt" : "Registreringen er fortrudt"); } catch (e) { besked("Kunne ikke fortryde."); }
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
    const sidst = formSidst(f);
    if (f.sidst === "dato" && !sidst) { besked("Vælg en dato"); return; }
    if (sidst && dagStart(sidst) > dagStart(Date.now())) { besked("Datoen kan ikke ligge i fremtiden"); return; }
    try {
      if (f.ret) {
        const o = f.opgave, aendret = sidst !== (o.lastDone || null);
        const patch = { name: navn, place: f.place.trim(), num: f.num, unit: f.unit, owner: f.owner || null, icon: f.icon || null, dueAt: sidst ? laegTil(sidst, f.num, f.unit) : Date.now() };
        if (aendret) {
          // Den gamle seneste registrering erstattes af den nye dato. Ældre historik bevares.
          const resten = (o.history || []).filter((h) => h.at !== o.lastDone);
          Object.assign(patch, { lastDone: sidst, lastBy: sidst ? S.lager.uid : null, lastNotified: null,
            history: sidst ? [{ at: sidst, by: S.lager.uid }, ...resten].sort((a, b) => b.at - a.at).slice(0, 10) : resten });
        }
        await S.lager.opdaterOpgave(f.id, patch);
        besked("Gemt");
      } else {
        const nu = Date.now();
        await S.lager.gemOpgave({ id: f.id, tag: f.tag, name: navn, place: f.place.trim(), num: f.num, unit: f.unit, owner: f.owner || null, icon: f.icon || null, lastDone: sidst, lastBy: sidst ? S.lager.uid : null,
          history: sidst ? [{ at: sidst, by: S.lager.uid }] : [], createdAt: nu, dueAt: sidst ? laegTil(sidst, f.num, f.unit) : nu, lastNotified: null });
        ding(); besked(f.id === f.tag ? "Mærket er klar" : "Opgaven er lagt på mærket");
      }
      S.visning = "hjem"; S.data = null; render();
    } catch (e) { besked("Kunne ikke gemme. Tjek forbindelsen."); }
  }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") lukArk(); });
document.addEventListener("change", (ev) => {
  const t = ev.target.id;
  if (t === "o-dato" && S.visning === "nyt") { laesForm(); render(); }
  if (t === "sorter") { S.sorter = ev.target.value; gem("plejer-sorter", S.sorter); render(); }
  if (t === "filter") { S.filter = ev.target.value; gem("plejer-filter", S.filter); render(); }
});

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
  S.firebase = !!(ops && ops.config);
  // plejer.dk/app/?demo åbner demoen direkte, fx fra hjemmesiden.
  if (S.firebase && p.has("demo") && !iDemo()) { startDemo(); return; }
  S.lager = S.firebase && !iDemo() ? new FirebaseLager(ops) : new DemoLager();
  if (S.firebase && S.lager.demo && !S.lager.data) S.lager.fyldDemo();
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
