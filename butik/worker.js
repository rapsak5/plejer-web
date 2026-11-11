// Kassen til Plejers webshop: en lille Cloudflare Worker, der laver en Stripe-betaling ud fra kurven.
// Kopieret fra StemplerInd. Kurven ligger i kundens browser. Workeren tager kun imod varenumre og antal og slår selv priserne op
// i katalog.js, så ingen kan rette prisen i browseren. Betalingssiden er Stripes egen.
//
// Hemmelighed: STRIPE_SECRET_KEY (en begrænset nøgle rk_... eller sk_...). Lægges ind i Cloudflare, aldrig i koden.

import { KATALOG } from './katalog.js';
import { stripeHaendelse } from './fragt.js';

const MAKS_LINJER = 12;
const MAKS_ANTAL = 50;
const STRIPE_SPROG = { da: 'da', en: 'en', sv: 'sv', no: 'nb', de: 'de' };
// Ingen køb nu, betal senere eller afbetaling i butikken. Udelukkes her, så det gælder uanset indstillingerne i Stripe.
export const UDELUKKET = ['klarna', 'affirm', 'afterpay_clearpay', 'alma', 'billie', 'scalapay', 'sequra', 'sunbit', 'zip'];

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

// Felterne til Stripe Checkout som formular. Priser i øre, inkl. moms.
export function sessionFelter({ varer, sprog, sti }, K = KATALOG) {
  const l = STRIPE_SPROG[sprog] ? sprog : 'da';
  const side = 'https://' + K.domaene + '/' + (K.sti[l] || '');
  const linjer = tjekKurv(varer, K);
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('locale', STRIPE_SPROG[l]);
  f.set('success_url', side + '?koeb=tak#pakker');
  f.set('cancel_url', side + '#pakker');
  f.set('allow_promotion_codes', 'true');
  UDELUKKET.forEach((t, i) => f.set(`excluded_payment_method_types[${i}]`, t));
  f.set('billing_address_collection', 'auto');
  linjer.forEach((v, i) => {
    const p = `line_items[${i}]`;
    f.set(`${p}[quantity]`, String(v.antal));
    f.set(`${p}[price_data][currency]`, K.valuta);
    f.set(`${p}[price_data][unit_amount]`, String(v.oere));
    f.set(`${p}[price_data][product_data][name]`, (v.navn && v.navn[l]) || v.navn.da);
    f.set(`${p}[price_data][product_data][metadata][vare]`, v.id);
    if (v.billede) f.set(`${p}[price_data][product_data][images][0]`, v.billede);
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
  f.set(`${r}[display_name]`, K.fragt.navn[l] || K.fragt.navn.da);
  // Linket til handelsbetingelserne står over betalingsknappen hos Stripe
  if (K.vilkaar && K.vilkaar[l]) f.set('custom_text[submit][message]', K.vilkaar[l]);
  f.set('metadata[kurv]', linjer.map(v => v.antal + 'x' + v.id).join(',').slice(0, 500));
  if (sti) f.set('metadata[side]', String(sti).slice(0, 100));
  return f;
}

function tilladtOprindelse(oprindelse, env, K) {
  const tilladt = ['https://' + K.domaene, 'https://www.' + K.domaene];
  if (env && env.EKSTRA_OPRINDELSE) tilladt.push(...String(env.EKSTRA_OPRINDELSE).split(',').map(s => s.trim()).filter(Boolean));
  return tilladt.includes(oprindelse) ? oprindelse : null;
}

function svar(data, status, oprindelse) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (oprindelse) Object.assign(h, { 'access-control-allow-origin': oprindelse, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
  return new Response(data === null ? null : JSON.stringify(data), { status, headers: h });
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
    if (req.method !== 'POST' || url.pathname !== '/kasse') return svar({ fejl: 'ikke-fundet' }, 404, oprindelse);
    if (!oprindelse) return svar({ fejl: 'oprindelse' }, 403, null);
    if (!env.STRIPE_SECRET_KEY) return svar({ fejl: 'mangler-noegle' }, 500, oprindelse);

    let krop;
    try {
      const tekst = await req.text();
      if (tekst.length > 4000) throw new Error('for-stor');
      krop = JSON.parse(tekst);
    } catch { return svar({ fejl: 'ugyldig' }, 400, oprindelse); }

    let felter;
    try { felter = sessionFelter(krop || {}, K); }
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
