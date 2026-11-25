// Betalt ordre fra Stripe til Shipmondo. Kopieret fra StemplerInd (24. nov. 2026).
// Stripe kalder /stripe, når en betaling er gennemført (hændelsen checkout.session.completed).
// Vi tjekker Stripes underskrift og opretter en ordre i Shipmondo med adresse, varer og fragt.
// I Shipmondo vælger Kasper ordren og printer labelen.
//
// Hemmeligheder i Cloudflare: STRIPE_WEBHOOK_SECRET (whsec_...), SHIPMONDO_API_USER og SHIPMONDO_API_KEY.
// Skabelonen findes på navnet: SHIPMONDO_SKABELON, ellers skabelon i katalog.js. "Plejer" finder "Plejer GLS pakkeshop"
// og "Plejer PostNord pakkeshop". StemplerInds skabeloner ligger på samme Shipmondo-konto, så søg aldrig kun på "pakkeshop".

const SHIPMONDO = 'https://app.shipmondo.com/api/public/v3';
const MOMS = 25;
// Shipmondo vil have momsen som brøk: 25 % skrives 0.25. Står der 25, ganger Shipmondo prisen med 26.
const MOMS_BROEK = MOMS / 100;
const TOLERANCE_SEK = 300;
// Fragtfirmaer, kunden kan vælge pakkeshop hos. Nøglen står i kurven og på betalingen, koden er Shipmondos.
export const FRAGTFIRMAER = { gls: { kode: 'gls', navn: 'GLS' }, postnord: { kode: 'pdk', navn: 'PostNord' } };

const kr = oere => Math.round(oere) / 100;
const udenMoms = oere => Math.round(oere / (1 + MOMS / 100)) / 100;

// Fragten på en betalt session. Stripe udfylder ikke altid shipping_cost, så vi falder tilbage på total_details
// og til sidst på totalen minus varerne (varer = liste af beløb i øre efter rabat).
export function fragtOere(s, varer) {
  const a = s.shipping_cost && s.shipping_cost.amount_total;
  if (a) return a;
  const b = s.total_details && s.total_details.amount_shipping;
  if (b) return b;
  if (Array.isArray(varer) && varer.length) return Math.max(0, (s.amount_total || 0) - varer.reduce((x, y) => x + y, 0));
  return 0;
}

function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

// Tjekker Stripe-Signature: t=tidsstempel,v1=hmac. Kaster en fejl, hvis den ikke passer.
export async function tjekUnderskrift(krop, header, hemmelighed, nu = Math.floor(Date.now() / 1000)) {
  if (!hemmelighed) throw new Error('mangler-webhook-noegle');
  const dele = Object.fromEntries(String(header || '').split(',').map(d => d.split('=')).filter(d => d.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const v1 = String(header || '').split(',').map(d => d.trim()).filter(d => d.startsWith('v1=')).map(d => d.slice(3));
  const t = Number(dele.t);
  if (!t || !v1.length) throw new Error('underskrift');
  if (Math.abs(nu - t) > TOLERANCE_SEK) throw new Error('for-gammel');
  const noegle = await crypto.subtle.importKey('raw', new TextEncoder().encode(hemmelighed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const forventet = hex(await crypto.subtle.sign('HMAC', noegle, new TextEncoder().encode(t + '.' + krop)));
  if (!v1.some(s => s.length === forventet.length && [...s].every((c, i) => c === forventet[i]))) throw new Error('underskrift');
  return true;
}

// Telefonnummeret, som fragtfirmaet sender besked til. Danske numre uden +45, så GLS og PostNord kan bruge dem.
export function telefon(nr, land = 'DK') {
  let t = String(nr || '').replace(/[\s().-]/g, '');
  if (!t) return null;
  if (land === 'DK') t = t.replace(/^(\+|00)45(?=\d{8}$)/, '');
  return t;
}

// Pakkeshoppen, kunden valgte i kurven. Kassen har slået den op hos Shipmondo og lagt den på betalingen.
export function valgtPakkeshop(s) {
  const m = s.metadata || {};
  if (!m.pakkeshop_id || !FRAGTFIRMAER[m.fragtfirma]) return null;
  return { firma: m.fragtfirma, id: m.pakkeshop_id, navn: m.pakkeshop_navn || '', adresse: m.pakkeshop_adresse || '', postnr: m.pakkeshop_postnr || '', by: m.pakkeshop_by || '' };
}

// Laver Shipmondos ordre ud fra Stripes Checkout Session og kataloget. Priser i kataloget er inkl. moms.
export function shipmondoOrdre(s, K, skabelonId) {
  const fragtAdr = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
  const kunde = s.customer_details || {};
  const a = fragtAdr.address || kunde.address || {};
  const modtager = {
    name: fragtAdr.name || kunde.name || '',
    address1: a.line1 || '',
    address2: a.line2 || null,
    zipcode: a.postal_code || '',
    city: a.city || '',
    country_code: a.country || 'DK',
    email: kunde.email || null,
    mobile: telefon(kunde.phone, a.country || 'DK'),
    telephone: telefon(kunde.phone, a.country || 'DK')
  };
  const valuta = String(s.currency || 'dkk').toUpperCase();
  // Svar fra Stripes ekstra felter, fx hvilke enkelte mærker kunden vil have
  const svar = Object.fromEntries((s.custom_fields || []).map(c => [c.key, String((c.text && c.text.value) || '').trim()]));
  const linjer = String((s.metadata && s.metadata.kurv) || '').split(',').filter(Boolean).map(d => {
    const i = d.indexOf('x'), antal = d.slice(0, i), id = d.slice(i + 1);
    const v = K.varer[id];
    if (!v) throw new Error('ukendt-vare ' + id);
    const ekstra = v.spoerg && svar[v.spoerg.noegle] ? ': ' + svar[v.spoerg.noegle] : '';
    return { line_type: 'item', item_name: (v.navn.da + ekstra).slice(0, 250), item_sku: (K.skuPraefiks || 'PL-') + id.toUpperCase(), quantity: Number(antal), unit_price_excluding_vat: udenMoms(v.oere), vat_percent: MOMS_BROEK, currency_code: valuta };
  });
  const fragt = fragtOere(s, linjer.map(l => Math.round(l.unit_price_excluding_vat * (1 + MOMS / 100) * 100) * l.quantity));
  if (fragt) linjer.push({ line_type: 'shipping', item_name: K.fragt.navn.da, quantity: 1, unit_price_excluding_vat: udenMoms(fragt), vat_percent: MOMS_BROEK, currency_code: valuta });
  const total = s.amount_total || 0;
  const ordre = {
    order_id: (s.metadata && s.metadata.ordre) || s.id,
    ordered_at: new Date((s.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    source_name: K.domaene,
    ship_to: modtager,
    bill_to: modtager,
    payment_details: { amount_including_vat: kr(total), amount_excluding_vat: udenMoms(total), authorized_amount: kr(total), vat_amount: Math.round(total - total / (1 + MOMS / 100)) / 100, vat_percent: MOMS_BROEK, currency_code: valuta, payment_method: 'Stripe', transaction_id: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || s.id },
    order_lines: linjer
  };
  const shop = valgtPakkeshop(s);
  if (shop) ordre.service_point = { id: shop.id, name: shop.navn, address1: shop.adresse, zipcode: shop.postnr, city: shop.by, country_code: 'DK' };
  if (skabelonId) ordre.shipment_template_id = skabelonId;
  return ordre;
}

async function shipmondo(sti, env, init = {}) {
  const auth = 'Basic ' + btoa(env.SHIPMONDO_API_USER + ':' + env.SHIPMONDO_API_KEY);
  return fetch(SHIPMONDO + sti, Object.assign({}, init, { headers: Object.assign({ authorization: auth, 'content-type': 'application/json', accept: 'application/json' }, init.headers || {}) }));
}

// Forsendelsesskabelonen til fragtfirmaet: navnet skal indeholde "Plejer" og firmaets navn, fx "Plejer PostNord pakkeshop".
// Findes ingen til firmaet, bruges den første Plejer-skabelon.
export function vaelgSkabelon(liste, navn, firma) {
  const alle = (Array.isArray(liste) ? liste : []).filter(x => String(x.name || '').toLowerCase().includes(navn));
  const f = firma && FRAGTFIRMAER[firma] ? FRAGTFIRMAER[firma].navn.toLowerCase() : null;
  const t = (f && alle.find(x => String(x.name || '').toLowerCase().includes(f))) || alle[0];
  return t ? t.id : null;
}

async function findSkabelon(env, firma, K) {
  const navn = String(env.SHIPMONDO_SKABELON || (K && K.skabelon) || 'Plejer').toLowerCase();
  try {
    const r = await shipmondo('/shipment_templates?per_page=50', env);
    if (!r.ok) return null;
    return vaelgSkabelon(await r.json(), navn, firma);
  } catch { return null; }
}

// Pakkeshops nær et postnummer hos GLS eller PostNord. Svaret gemmes et døgn hos Cloudflare,
// fordi Shipmondo tæller opslagene. Kun det, kurven skal vise.
// Pakkebokse (fx PostNords Nærboks) kommer efter de bemandede pakkeshops, så kunden også ser butikker.
const BOKS = /n(æ|ae)rboks|pakkeboks|parcel ?locker|pakkeautomat/i;
export const erBoks = p => BOKS.test(p.navn);
// PostNord skriver byen med store bogstaver. "KØBENHAVN S" bliver "København S".
const pænBy = by => (by === by.toUpperCase() ? by.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, f, b) => f + b.toUpperCase()) : by);
export function pakkeshopListe(data, maks = 12) {
  const alle = (Array.isArray(data) ? data : []).map(p => ({
    id: String(p.number || p.id || ''),
    navn: String(p.company_name || p.name || '').trim(),
    adresse: String(p.address || '').trim(),
    postnr: String(p.zipcode || ''),
    by: pænBy(String(p.city || '').trim()),
    afstand: Number.isFinite(+p.distance) ? Math.round(+p.distance) : null
  })).filter(p => p.id && p.navn);
  return alle.filter(p => !erBoks(p)).concat(alle.filter(erBoks)).slice(0, maks);
}

export async function findPakkeshops(firma, postnr, env) {
  if (!FRAGTFIRMAER[firma]) throw new Error('fragtfirma');
  if (!/^\d{4}$/.test(String(postnr || ''))) throw new Error('postnr');
  if (!env.SHIPMONDO_API_USER || !env.SHIPMONDO_API_KEY) throw new Error('mangler-shipmondo');
  const sti = '/pickup_points?carrier_code=' + FRAGTFIRMAER[firma].kode + '&country_code=DK&zipcode=' + postnr + '&quantity=25';
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  // Versionen i nøglen skal tælles op, når listens form ændres, så gamle lister i Cloudflares cache ikke bruges
  const noegle = 'https://pakkeshops.plejer.invalid/v1/' + firma + '/' + postnr;
  if (cache) { const gemt = await cache.match(noegle).catch(() => null); if (gemt) return gemt.json(); }
  const r = await shipmondo(sti, env);
  if (!r.ok) { console.log('Shipmondo pakkeshops', r.status, (await r.text()).slice(0, 200)); throw new Error('shipmondo'); }
  const liste = pakkeshopListe(await r.json());
  if (cache && liste.length) await cache.put(noegle, new Response(JSON.stringify(liste), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=86400' } })).catch(() => {});
  return liste;
}

// Svarer Stripe. 200 = færdig, 500 = Stripe prøver igen senere.
export async function stripeHaendelse(req, env, K) {
  const krop = await req.text();
  try { await tjekUnderskrift(krop, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return new Response(JSON.stringify({ fejl: e.message }), { status: 400 }); }

  const h = JSON.parse(krop);
  const s = h.data && h.data.object;
  if (h.type !== 'checkout.session.completed' || !s || s.payment_status !== 'paid') return new Response('{"ok":true,"springet":true}', { status: 200 });
  // Betalinger fra en anden butik springes over (hvis en Stripe-konto en dag deles)
  if (s.metadata && s.metadata.butik && s.metadata.butik !== K.domaene) return new Response('{"ok":true,"anden-butik":true}', { status: 200 });
  if (!env.SHIPMONDO_API_USER || !env.SHIPMONDO_API_KEY) { console.log('Shipmondo mangler nøgle, ordre', s.id); return new Response('{"ok":true,"shipmondo":false}', { status: 200 }); }

  let ordre;
  try { ordre = shipmondoOrdre(s, K, await findSkabelon(env, (s.metadata || {}).fragtfirma, K)); }
  catch (e) { console.log('Ordren kunne ikke laves', s.id, e.message); return new Response(JSON.stringify({ fejl: e.message }), { status: 200 }); }

  const r = await shipmondo('/sales_orders', env, { method: 'POST', body: JSON.stringify(ordre) });
  if (r.ok) return new Response('{"ok":true,"shipmondo":true}', { status: 200 });
  const tekst = await r.text();
  // Findes ordren allerede (Stripe har sendt den før), er det fint
  if (r.status === 422 && /order_id|already|exist/i.test(tekst)) return new Response('{"ok":true,"findes":true}', { status: 200 });
  console.log('Shipmondo-fejl', r.status, tekst.slice(0, 300));
  return new Response('{"fejl":"shipmondo"}', { status: 500 });
}
