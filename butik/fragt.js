// Betalt ordre fra Stripe til Shipmondo.
// Stripe kalder /stripe, når en betaling er gennemført (hændelsen checkout.session.completed).
// Vi tjekker Stripes underskrift og opretter en ordre i Shipmondo med adresse, varer og fragt.
// I Shipmondo vælger Kasper ordren og printer labelen.
//
// Hemmeligheder i Cloudflare: STRIPE_WEBHOOK_SECRET (whsec_...), SHIPMONDO_API_USER og SHIPMONDO_API_KEY.
// Forsendelsesskabelonen findes på navn: SHIPMONDO_SKABELON, ellers skabelon i katalog.js ("Plejer" finder "Plejer GLS pakkeshop").

const SHIPMONDO = 'https://app.shipmondo.com/api/public/v3';
const MOMS = 25;
const TOLERANCE_SEK = 300;

const kr = oere => Math.round(oere) / 100;
const udenMoms = oere => Math.round(oere / (1 + MOMS / 100)) / 100;

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
    mobile: kunde.phone || null
  };
  const valuta = String(s.currency || 'dkk').toUpperCase();
  // Svar fra Stripes ekstra felter, fx hvilke enkelte mærker kunden vil have
  const svar = Object.fromEntries((s.custom_fields || []).map(c => [c.key, String((c.text && c.text.value) || '').trim()]));
  const linjer = String((s.metadata && s.metadata.kurv) || '').split(',').filter(Boolean).map(d => {
    const [antal, id] = d.split('x');
    const v = K.varer[id];
    if (!v) throw new Error('ukendt-vare ' + id);
    const ekstra = v.spoerg && svar[v.spoerg.noegle] ? ': ' + svar[v.spoerg.noegle] : '';
    return { line_type: 'item', item_name: (v.navn.da + ekstra).slice(0, 250), item_sku: (K.skuPraefiks || 'SI-') + id.toUpperCase(), quantity: Number(antal), unit_price_excluding_vat: udenMoms(v.oere), vat_percent: MOMS, currency_code: valuta };
  });
  const fragt = (s.shipping_cost && s.shipping_cost.amount_total) || 0;
  if (fragt) linjer.push({ line_type: 'shipping', item_name: K.fragt.navn.da, quantity: 1, unit_price_excluding_vat: udenMoms(fragt), vat_percent: MOMS, currency_code: valuta });
  const total = s.amount_total || 0;
  const ordre = {
    order_id: s.id,
    ordered_at: new Date((s.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    source_name: K.domaene,
    ship_to: modtager,
    bill_to: modtager,
    payment_details: { amount_including_vat: kr(total), amount_excluding_vat: udenMoms(total), vat_amount: Math.round(total - total / (1 + MOMS / 100)) / 100, vat_percent: MOMS, currency_code: valuta, payment_method: 'Stripe', transaction_id: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || s.id },
    order_lines: linjer
  };
  if (skabelonId) ordre.shipment_template_id = skabelonId;
  return ordre;
}

async function shipmondo(sti, env, init = {}) {
  const auth = 'Basic ' + btoa(env.SHIPMONDO_API_USER + ':' + env.SHIPMONDO_API_KEY);
  return fetch(SHIPMONDO + sti, Object.assign({}, init, { headers: Object.assign({ authorization: auth, 'content-type': 'application/json', accept: 'application/json' }, init.headers || {}) }));
}

async function findSkabelon(env, K) {
  const navn = String(env.SHIPMONDO_SKABELON || K.skabelon || 'StemplerInd').toLowerCase();
  try {
    const r = await shipmondo('/shipment_templates?per_page=50', env);
    if (!r.ok) return null;
    const liste = await r.json();
    const t = (Array.isArray(liste) ? liste : []).find(x => String(x.name || '').toLowerCase().includes(navn));
    return t ? t.id : null;
  } catch { return null; }
}

// Svarer Stripe. 200 = færdig, 500 = Stripe prøver igen senere.
export async function stripeHaendelse(req, env, K) {
  const krop = await req.text();
  try { await tjekUnderskrift(krop, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return new Response(JSON.stringify({ fejl: e.message }), { status: 400 }); }

  const h = JSON.parse(krop);
  const s = h.data && h.data.object;
  if (h.type !== 'checkout.session.completed' || !s || s.payment_status !== 'paid') return new Response('{"ok":true,"springet":true}', { status: 200 });
  if (!env.SHIPMONDO_API_USER || !env.SHIPMONDO_API_KEY) { console.log('Shipmondo mangler nøgle, ordre', s.id); return new Response('{"ok":true,"shipmondo":false}', { status: 200 }); }

  let ordre;
  try { ordre = shipmondoOrdre(s, K, await findSkabelon(env, K)); }
  catch (e) { console.log('Ordren kunne ikke laves', s.id, e.message); return new Response(JSON.stringify({ fejl: e.message }), { status: 200 }); }

  const r = await shipmondo('/sales_orders', env, { method: 'POST', body: JSON.stringify(ordre) });
  if (r.ok) return new Response('{"ok":true,"shipmondo":true}', { status: 200 });
  const tekst = await r.text();
  // Findes ordren allerede (Stripe har sendt den før), er det fint
  if (r.status === 422 && /order_id|already|exist/i.test(tekst)) return new Response('{"ok":true,"findes":true}', { status: 200 });
  console.log('Shipmondo-fejl', r.status, tekst.slice(0, 300));
  return new Response('{"fejl":"shipmondo"}', { status: 500 });
}
