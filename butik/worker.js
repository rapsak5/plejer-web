// Kassen til Plejers webshop: en lille Cloudflare Worker, der laver en Stripe-betaling ud fra kurven.
// Kopieret fra StemplerInd (24. nov. 2026). Logikken er den samme, kun katalog, navne og ordreprefiks er Plejers.
// Kurven ligger i kundens browser. Workeren tager kun imod varenumre og antal og slår selv priserne op
// i katalog.js, så ingen kan rette prisen i browseren. Betalingssiden er Stripes egen.
//
// Hemmelighed: STRIPE_SECRET_KEY (en begrænset nøgle rk_... eller sk_...). Lægges ind i Cloudflare, aldrig i koden.

import { KATALOG } from './katalog.js';
import { stripeHaendelse, fragtOere, findPakkeshops, valgtPakkeshop, FRAGTFIRMAER } from './fragt.js';

const MAKS_LINJER = 12;
const MAKS_ANTAL = 50;
const STRIPE_SPROG = { da: 'da', en: 'en', sv: 'sv', no: 'nb', de: 'de' };
// Ingen køb nu, betal senere eller afbetaling i butikken. Udelukkes her, så det gælder uanset indstillingerne i Stripe.
export const UDELUKKET = ['klarna', 'affirm', 'afterpay_clearpay', 'alma', 'billie', 'scalapay', 'sequra', 'sunbit', 'zip'];
// Takkesiden viser kun ordrer, der er højst så gamle. Linket i kundens browserhistorik holder ikke op for evigt.
const TAK_DAGE = 30;
// Stripe Tax: almindelige fysiske varer og fragt. Begge med 25 % dansk moms.
const TAX_VARE = 'txcd_99999999';
const TAX_FRAGT = 'txcd_92010001';

// Kort ordrenummer, som kunden ser på takkesiden og kan skrive i en mail. Står også på betalingen i Stripe og ordren i Shipmondo.
const TEGN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function nytOrdrenummer(tal = crypto.getRandomValues(new Uint8Array(6)), K = KATALOG) {
  return (K.ordrePraefiks || 'PL-') + [...tal].map(b => TEGN[b % TEGN.length]).join('');
}

// Tjekker kurven. Returnerer de linjer, der skal betales, eller kaster en fejl med en kort kode.
export function tjekKurv(varer, K = KATALOG) {
  if (!Array.isArray(varer) || varer.length === 0) throw new Error('tom');
  if (varer.length > MAKS_LINJER) throw new Error('for-mange-linjer');
  const samlet = new Map();
  for (const v of varer) {
    const id = String(v && v.id || '');
    const antal = Number(v && v.antal);
    if (!Object.prototype.hasOwnProperty.call(K.varer, id)) throw new Error('ukendt-vare');
    if (!Number.isInteger(antal) || antal < 1 || antal > MAKS_ANTAL) throw new Error('forkert-antal');
    samlet.set(id, (samlet.get(id) || 0) + antal);
  }
  return [...samlet].map(([id, antal]) => {
    if (antal > MAKS_ANTAL) throw new Error('forkert-antal');
    return { id, antal, ...K.varer[id] };
  });
}

// Pakkeshoppen fra kurven. Browseren sender firma, postnummer og id. Kassen slår den op igen hos Shipmondo,
// så navn og adresse på ordren altid kommer fra fragtfirmaet og ikke fra browseren.
export async function tjekPakkeshop(valg, env, opslag = findPakkeshops) {
  const v = valg || {};
  const firma = String(v.firma || ''), postnr = String(v.postnr || ''), id = String(v.id || '');
  if (!FRAGTFIRMAER[firma] || !/^\d{4}$/.test(postnr) || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('pakkeshop');
  const liste = await opslag(firma, postnr, env);
  const shop = liste.find(p => p.id === id);
  if (!shop) throw new Error('pakkeshop');
  return Object.assign({ firma }, shop);
}

// Felterne til Stripe Checkout som formular. Priser i øre, inkl. moms.
export function sessionFelter({ varer, sprog, sti }, K = KATALOG, ordre = nytOrdrenummer(undefined, K), shop = null) {
  const l = STRIPE_SPROG[sprog] ? sprog : 'da';
  const side = 'https://' + K.domaene + '/' + (K.sti[l] || '');
  const linjer = tjekKurv(varer, K);
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('locale', STRIPE_SPROG[l]);
  // Stripe skriver selv sessionens id i stedet for {CHECKOUT_SESSION_ID}
  f.set('success_url', side + 'tak.html?id={CHECKOUT_SESSION_ID}');
  f.set('cancel_url', side + '#pakker');
  f.set('allow_promotion_codes', 'true');
  UDELUKKET.forEach((t, i) => f.set(`excluded_payment_method_types[${i}]`, t));
  f.set('billing_address_collection', 'auto');
  // GLS og PostNord sender besked på sms, når pakken kan hentes, og vil ikke oprette forsendelsen uden et nummer
  f.set('phone_number_collection[enabled]', 'true');
  linjer.forEach((v, i) => {
    const p = `line_items[${i}]`;
    f.set(`${p}[quantity]`, String(v.antal));
    f.set(`${p}[price_data][currency]`, K.valuta);
    f.set(`${p}[price_data][unit_amount]`, String(v.oere));
    f.set(`${p}[price_data][product_data][name]`, (v.navn && v.navn[l]) || v.navn.da);
    f.set(`${p}[price_data][product_data][metadata][vare]`, v.id);
    if (v.billede) f.set(`${p}[price_data][product_data][images][0]`, v.billede);
    // Prisen er inkl. moms. Stripe Tax trækker momsen ud, så den står på betalingssiden og kvitteringen.
    if (K.stripeTax) {
      f.set(`${p}[price_data][tax_behavior]`, 'inclusive');
      f.set(`${p}[price_data][product_data][tax_code]`, TAX_VARE);
    }
  });
  // Spørgsmål fra varerne, fx hvilke enkelte mærker kunden vil have. Stripe tillader højst tre.
  linjer.filter(v => v.spoerg).slice(0, 3).forEach((v, i) => {
    const c = `custom_fields[${i}]`;
    f.set(`${c}[key]`, v.spoerg.noegle);
    f.set(`${c}[type]`, 'text');
    f.set(`${c}[label][type]`, 'custom');
    f.set(`${c}[label][custom]`, (v.spoerg.tekst[l] || v.spoerg.tekst.da).slice(0, 50));
  });
  K.lande.forEach((land, i) => f.set(`shipping_address_collection[allowed_countries][${i}]`, land));
  const r = 'shipping_options[0][shipping_rate_data]';
  f.set(`${r}[type]`, 'fixed_amount');
  f.set(`${r}[fixed_amount][amount]`, String(K.fragt.oere));
  f.set(`${r}[fixed_amount][currency]`, K.valuta);
  if (K.stripeTax) {
    f.set(`${r}[tax_behavior]`, 'inclusive');
    f.set(`${r}[tax_code]`, TAX_FRAGT);
    f.set('automatic_tax[enabled]', 'true');
  }
  const shopOrd = (K.fragt.shop && (K.fragt.shop[l] || K.fragt.shop.da)) || '';
  f.set(`${r}[display_name]`, shop ? (FRAGTFIRMAER[shop.firma].navn + ' ' + shopOrd + ': ' + shop.navn).slice(0, 100) : (K.fragt.navn[l] || K.fragt.navn.da));
  if (shop) {
    const til = (K.fragt.til && (K.fragt.til[l] || K.fragt.til.da)) || '';
    const adr = shop.navn + ', ' + shop.adresse + ', ' + shop.postnr + ' ' + shop.by;
    if (til) f.set('custom_text[shipping_address][message]', til.replace('{shop}', adr).slice(0, 1200));
    f.set('metadata[fragtfirma]', shop.firma);
    f.set('metadata[pakkeshop_id]', shop.id);
    f.set('metadata[pakkeshop_navn]', shop.navn.slice(0, 200));
    f.set('metadata[pakkeshop_adresse]', shop.adresse.slice(0, 200));
    f.set('metadata[pakkeshop_postnr]', shop.postnr);
    f.set('metadata[pakkeshop_by]', shop.by.slice(0, 100));
  }
  // Linket til handelsbetingelserne står over betalingsknappen hos Stripe
  if (K.vilkaar && K.vilkaar[l]) f.set('custom_text[submit][message]', K.vilkaar[l]);
  f.set('metadata[kurv]', linjer.map(v => v.antal + 'x' + v.id).join(',').slice(0, 500));
  f.set('metadata[ordre]', ordre);
  f.set('payment_intent_data[metadata][ordre]', ordre);
  f.set('payment_intent_data[description]', 'Plejer ' + ordre);
  // Butikken står også på betalingen, så den kan kendes, hvis flere butikker en dag deler konto
  f.set('metadata[butik]', K.domaene);
  f.set('payment_intent_data[metadata][butik]', K.domaene);
  if (sti) f.set('metadata[side]', String(sti).slice(0, 100));
  return f;
}

// Det, takkesiden må vise om en ordre. Kun det kunden selv har tastet og købt, aldrig kortdata.
export function ordreResume(s, nu = Math.floor(Date.now() / 1000)) {
  if (!s || !/^cs_/.test(String(s.id || ''))) throw new Error('ikke-fundet');
  if (s.created && nu - s.created > TAK_DAGE * 86400) throw new Error('udloebet');
  const total = s.amount_total || 0;
  const kunde = s.customer_details || {};
  const lev = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
  const a = (lev && lev.address) || {};
  const varer = ((s.line_items && s.line_items.data) || []).map(l => ({ navn: l.description || '', antal: l.quantity || 1, beloeb: l.amount_total || 0 }));
  return {
    ordre: (s.metadata && s.metadata.ordre) || null,
    betalt: s.payment_status === 'paid' || s.payment_status === 'no_payment_required',
    test: s.livemode === false,
    dato: s.created ? new Date(s.created * 1000).toISOString() : null,
    valuta: String(s.currency || 'dkk').toUpperCase(),
    varer,
    fragt: fragtOere(s, varer.map(v => v.beloeb)),
    total,
    // Priserne er inkl. 25 % moms, så momsen er en femtedel af beløbet
    moms: (s.total_details && Number.isInteger(s.total_details.amount_tax) && s.total_details.amount_tax > 0) ? s.total_details.amount_tax : Math.round(total - total / 1.25),
    mail: kunde.email || null,
    pakkeshop: (() => { const p = valgtPakkeshop(s); return p ? { firma: FRAGTFIRMAER[p.firma].navn, navn: p.navn, adresse: p.adresse, postnr: p.postnr, by: p.by } : null; })(),
    levering: lev ? { navn: lev.name || '', linjer: [a.line1, a.line2].filter(Boolean), postnr: a.postal_code || '', by: a.city || '', land: a.country || '' } : null
  };
}

function tilladtOprindelse(oprindelse, env, K) {
  const tilladt = ['https://' + K.domaene, 'https://www.' + K.domaene];
  if (env && env.EKSTRA_OPRINDELSE) tilladt.push(...String(env.EKSTRA_OPRINDELSE).split(',').map(s => s.trim()).filter(Boolean));
  return tilladt.includes(oprindelse) ? oprindelse : null;
}

function svar(data, status, oprindelse) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (oprindelse) Object.assign(h, { 'access-control-allow-origin': oprindelse, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
  return new Response(data === null ? null : JSON.stringify(data), { status, headers: h });
}

async function hentOrdre(id, env, oprindelse) {
  if (!oprindelse) return svar({ fejl: 'oprindelse' }, 403, null);
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(String(id || ''))) return svar({ fejl: 'ugyldig' }, 400, oprindelse);
  if (!env.STRIPE_SECRET_KEY) return svar({ fejl: 'mangler-noegle' }, 500, oprindelse);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + id + '?expand[]=line_items', { headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY } });
  if (r.status === 404) return svar({ fejl: 'ikke-fundet' }, 404, oprindelse);
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) { console.log('Stripe-fejl ved ordre', r.status); return svar({ fejl: 'stripe' }, 502, oprindelse); }
  try { return svar(ordreResume(data), 200, oprindelse); }
  catch (e) { return svar({ fejl: e.message }, e.message === 'udloebet' ? 410 : 404, oprindelse); }
}

export default {
  async fetch(req, env) {
    const K = KATALOG;
    const url = new URL(req.url);
    const oprindelse = tilladtOprindelse(req.headers.get('origin') || '', env, K);

    // Stripe melder betalte ordrer her. De sendes videre til Shipmondo.
    if (req.method === 'POST' && url.pathname === '/stripe') return stripeHaendelse(req, env, K);
    if (req.method === 'OPTIONS') return svar(null, oprindelse ? 204 : 403, oprindelse);
    if (req.method === 'GET' && url.pathname === '/') return svar({ ok: true, butik: K.domaene, test: String(env.STRIPE_SECRET_KEY || '').includes('_test_'), shipmondo: !!(env.SHIPMONDO_API_USER && env.SHIPMONDO_API_KEY && env.STRIPE_WEBHOOK_SECRET) }, 200, oprindelse);
    // Takkesiden henter ordren her ud fra sessionens id i adressen
    if (req.method === 'GET' && url.pathname === '/ordre') return hentOrdre(url.searchParams.get('id'), env, oprindelse);
    // Kurven henter pakkeshops nær kundens postnummer her
    if (req.method === 'GET' && url.pathname === '/pakkeshops') {
      if (!oprindelse) return svar({ fejl: 'oprindelse' }, 403, null);
      try { return svar({ pakkeshops: await findPakkeshops(url.searchParams.get('firma'), url.searchParams.get('postnr'), env) }, 200, oprindelse); }
      catch (e) { return svar({ fejl: e.message }, /^(fragtfirma|postnr)$/.test(e.message) ? 400 : 502, oprindelse); }
    }
    if (req.method !== 'POST' || url.pathname !== '/kasse') return svar({ fejl: 'ikke-fundet' }, 404, oprindelse);
    if (!oprindelse) return svar({ fejl: 'oprindelse' }, 403, null);
    if (!env.STRIPE_SECRET_KEY) return svar({ fejl: 'mangler-noegle' }, 500, oprindelse);

    let krop;
    try {
      const tekst = await req.text();
      if (tekst.length > 4000) throw new Error('for-stor');
      krop = JSON.parse(tekst);
    } catch { return svar({ fejl: 'ugyldig' }, 400, oprindelse); }

    // Kurven sender den pakkeshop, kunden har valgt. Kassen tjekker den hos Shipmondo.
    // En ældre kurv uden pakkeshop kan stadig betale, så vælges shoppen i Shipmondo bagefter.
    let shop = null;
    if (krop && krop.pakkeshop && env.SHIPMONDO_API_USER && env.SHIPMONDO_API_KEY) {
      try { shop = await tjekPakkeshop(krop && krop.pakkeshop, env); }
      catch (e) { return svar({ fejl: e.message === 'shipmondo' ? 'shipmondo' : 'pakkeshop' }, e.message === 'shipmondo' ? 502 : 400, oprindelse); }
    }

    let felter;
    try { felter = sessionFelter(krop || {}, K, undefined, shop); }
    catch (e) { return svar({ fejl: e.message }, 400, oprindelse); }

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
      body: felter.toString()
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.url) {
      console.log('Stripe-fejl', r.status, data && data.error && data.error.message);
      return svar({ fejl: 'stripe' }, 502, oprindelse);
    }
    return svar({ url: data.url }, 200, oprindelse);
  }
};
