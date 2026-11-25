// Betalt ordre fra Stripe til Shipmondo: underskriften skal passe, og ordren skal have rigtige beløb, moms, telefon og pakkeshop.
// Bygget på StemplerInds test fra 24. nov. 2026.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tjekUnderskrift, shipmondoOrdre, stripeHaendelse, telefon, vaelgSkabelon, pakkeshopListe, fragtOere } from '../butik/fragt.js';
import { KATALOG } from '../butik/katalog.js';

const HEMMELIG = 'whsec_test123';
async function underskriv(krop, t, hemmelig = HEMMELIG) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(hemmelig), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t + '.' + krop)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
}

// 1 x Pakke 1 (199) + 2 x Pakke 2 (199) + fragt (49) = 646 kr.
const session = {
  id: 'cs_test_abc', object: 'checkout.session', created: 1794300000, currency: 'dkk', payment_status: 'paid', payment_intent: 'pi_123',
  amount_total: 64600, shipping_cost: { amount_total: 4900 },
  metadata: { kurv: '1xpakke-1,2xpakke-2', butik: 'plejer.dk', ordre: 'PL-TEST42', fragtfirma: 'postnord', pakkeshop_id: '1234', pakkeshop_navn: 'Netto Amagerbrogade', pakkeshop_adresse: 'Amagerbrogade 1', pakkeshop_postnr: '2300', pakkeshop_by: 'København S' },
  customer_details: { email: 'kunde@example.com', name: 'Kunde Kundesen', phone: '+45 24 42 54 25', address: { country: 'DK', postal_code: '2300' } },
  collected_information: { shipping_details: { name: 'Kunde Kundesen', address: { line1: 'Testvej 1', line2: null, postal_code: '2300', city: 'København S', country: 'DK' } } }
};
const iAlt = o => o.order_lines.reduce((x, l) => x + Math.round(l.unit_price_excluding_vat * (1 + l.vat_percent) * 100) * l.quantity, 0);

describe('Stripe til Shipmondo', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('godkender kun Stripes rigtige underskrift inden for 300 sekunder', async () => {
    const krop = '{"a":1}', t = 1794300000;
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), HEMMELIG, t)).resolves.toBe(true);
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), HEMMELIG, t + 299)).resolves.toBe(true);
    await expect(tjekUnderskrift(krop, await underskriv(krop, t, 'whsec_forkert'), HEMMELIG, t)).rejects.toThrow('underskrift');
    await expect(tjekUnderskrift('{"a":2}', await underskriv(krop, t), HEMMELIG, t)).rejects.toThrow('underskrift');
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), HEMMELIG, t + 301)).rejects.toThrow('for-gammel');
    await expect(tjekUnderskrift(krop, '', HEMMELIG, t)).rejects.toThrow('underskrift');
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), '', t)).rejects.toThrow('mangler-webhook-noegle');
  });

  it('laver ordren med Plejers varenumre, ordrenummer, fragt og adresse', () => {
    const o = shipmondoOrdre(session, KATALOG, 42);
    expect(o.order_id).toBe('PL-TEST42');
    expect(o.source_name).toBe('plejer.dk');
    expect(o.shipment_template_id).toBe(42);
    expect(o.ship_to).toMatchObject({ name: 'Kunde Kundesen', address1: 'Testvej 1', zipcode: '2300', city: 'København S', country_code: 'DK', email: 'kunde@example.com' });
    expect(o.order_lines).toHaveLength(3);
    expect(o.order_lines[0]).toMatchObject({ line_type: 'item', item_name: 'Pakke 1, 8 hvide mærker', item_sku: 'PL-PAKKE-1', quantity: 1, unit_price_excluding_vat: 159.2 });
    expect(o.order_lines[1]).toMatchObject({ item_name: 'Pakke 2, 8 sorte mærker', item_sku: 'PL-PAKKE-2', quantity: 2, unit_price_excluding_vat: 159.2 });
    expect(o.order_lines[2]).toMatchObject({ line_type: 'shipping', item_name: KATALOG.fragt.navn.da, unit_price_excluding_vat: 39.2 });
    expect(o.payment_details).toMatchObject({ amount_including_vat: 646, amount_excluding_vat: 516.8, authorized_amount: 646, vat_amount: 129.2, currency_code: 'DKK', transaction_id: 'pi_123' });
    // Uden ordrenummer bruges sessionens id
    expect(shipmondoOrdre(Object.assign({}, session, { metadata: { kurv: '1xpakke-1' } }), KATALOG).order_id).toBe('cs_test_abc');
  });

  it('sender momsen som brøk 0.25 på alle linjer og på betalingen, ellers ganger Shipmondo med 26', () => {
    const o = shipmondoOrdre(session, KATALOG);
    expect(o.order_lines.every(l => l.vat_percent === 0.25)).toBe(true);
    expect(o.payment_details.vat_percent).toBe(0.25);
  });

  it('linjerne inkl. moms giver præcis Stripes amount_total', () => {
    expect(iAlt(shipmondoOrdre(session, KATALOG))).toBe(session.amount_total);
    // Alle kombinationer af varer og antal op til 3
    const ids = Object.keys(KATALOG.varer);
    for (let n = 1; n < 4 ** ids.length; n++) {
      const antal = ids.map((_, i) => Math.floor(n / 4 ** i) % 4);
      const kurv = ids.map((id, i) => antal[i] ? antal[i] + 'x' + id : '').filter(Boolean).join(',');
      if (!kurv) continue;
      const total = ids.reduce((s, id, i) => s + antal[i] * KATALOG.varer[id].oere, 0) + KATALOG.fragt.oere;
      const s = Object.assign({}, session, { amount_total: total, metadata: { kurv } });
      expect(iAlt(shipmondoOrdre(s, KATALOG)), kurv).toBe(total);
    }
  });

  it('finder fragten, også uden shipping_cost', () => {
    expect(fragtOere({ shipping_cost: { amount_total: 4900 } })).toBe(4900);
    expect(fragtOere({ total_details: { amount_shipping: 4900 } })).toBe(4900);
    expect(fragtOere({ amount_total: 24800 }, [19900])).toBe(4900);
    const o = shipmondoOrdre(Object.assign({}, session, { shipping_cost: null }), KATALOG);
    expect(o.order_lines.find(l => l.line_type === 'shipping').unit_price_excluding_vat).toBe(39.2);
  });

  it('sender telefonnummer i både mobile og telephone og den valgte pakkeshop med', () => {
    const o = shipmondoOrdre(session, KATALOG, 9);
    expect(o.ship_to.mobile).toBe('24425425');
    expect(o.ship_to.telephone).toBe('24425425');
    expect(o.service_point).toEqual({ id: '1234', name: 'Netto Amagerbrogade', address1: 'Amagerbrogade 1', zipcode: '2300', city: 'København S', country_code: 'DK' });
    const uden = shipmondoOrdre(Object.assign({}, session, { metadata: { kurv: '1xpakke-1' } }), KATALOG);
    expect(uden.service_point).toBeUndefined();
  });

  it('renser telefonnumre', () => {
    expect(telefon('+4524425425')).toBe('24425425');
    expect(telefon('0045 24 42 54 25')).toBe('24425425');
    expect(telefon('+45 (24) 42-54-25')).toBe('24425425');
    expect(telefon('24425425')).toBe('24425425');
    expect(telefon('+46701234567', 'SE')).toBe('+46701234567');
    expect(telefon('')).toBeNull();
    expect(telefon(null)).toBeNull();
  });

  it('vælger Plejers skabelon til fragtfirmaet og aldrig StemplerInds', () => {
    const liste = [{ id: 1, name: 'StemplerInd GLS pakkeshop' }, { id: 2, name: 'StemplerInd PostNord pakkeshop' }, { id: 7, name: 'Plejer GLS pakkeshop' }, { id: 8, name: 'Plejer PostNord pakkeshop' }];
    expect(vaelgSkabelon(liste, 'plejer', 'postnord')).toBe(8);
    expect(vaelgSkabelon(liste, 'plejer', 'gls')).toBe(7);
    expect(vaelgSkabelon(liste, 'plejer', null)).toBe(7);
    expect(vaelgSkabelon(liste.slice(0, 3), 'plejer', 'postnord')).toBe(7);
    expect(vaelgSkabelon(liste.slice(0, 2), 'plejer', 'gls')).toBeNull();
    expect(vaelgSkabelon(null, 'plejer', 'gls')).toBeNull();
  });

  it('sorterer pakkeshops med butikker før bokse, højst 12, og retter bynavne', () => {
    const l = pakkeshopListe([{ number: '95892', company_name: 'Pakkeshop Kiosk ', address: 'Vindegade 1', zipcode: '5000', city: 'Odense C', distance: 182.4 }, { number: '', company_name: 'Uden id' }]);
    expect(l).toEqual([{ id: '95892', navn: 'Pakkeshop Kiosk', adresse: 'Vindegade 1', postnr: '5000', by: 'Odense C', afstand: 182 }]);
    expect(pakkeshopListe(null)).toEqual([]);
    const pn = pakkeshopListe([
      { number: '1', company_name: 'Nærboks Lidl', address: 'Vej 1', zipcode: '2300', city: 'KØBENHAVN S' },
      { number: '2', company_name: 'PostNord Pakkeboks Føtex', address: 'Vej 2', zipcode: '2300', city: 'KØBENHAVN S' },
      { number: '3', company_name: 'Parcel Locker Metro', address: 'Vej 3', zipcode: '2300', city: 'KØBENHAVN S' },
      { number: '4', company_name: 'Netto Amagerbrogade', address: 'Vej 4', zipcode: '2300', city: 'KØBENHAVN S' },
      { number: '5', company_name: 'Pakkeautomat Kastrup', address: 'Vej 5', zipcode: '2770', city: 'KASTRUP' }
    ]);
    expect(pn.map(p => p.id)).toEqual(['4', '1', '2', '3', '5']);
    expect(pn[0].by).toBe('København S');
    expect(pn[4].by).toBe('Kastrup');
    expect(pakkeshopListe(Array.from({ length: 30 }, (_, i) => ({ number: String(i + 1), company_name: 'Shop ' + i })))).toHaveLength(12);
  });

  it('bruger den gamle shipping_details, hvis Stripe sender den', () => {
    const s = Object.assign({}, session, { collected_information: null, shipping_details: { name: 'Gammel Form', address: { line1: 'Vej 2', postal_code: '8000', city: 'Aarhus C', country: 'DK' } } });
    expect(shipmondoOrdre(s, KATALOG).ship_to).toMatchObject({ name: 'Gammel Form', address1: 'Vej 2', city: 'Aarhus C' });
  });

  async function haendelse(s, svar) {
    const env = { STRIPE_WEBHOOK_SECRET: HEMMELIG, SHIPMONDO_API_USER: 'u', SHIPMONDO_API_KEY: 'k' };
    const krop = JSON.stringify({ type: 'checkout.session.completed', data: { object: s } });
    const kald = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      kald.push([String(url), init && init.method, init && init.body]);
      if (String(url).includes('shipment_templates')) return new Response(JSON.stringify([{ id: 2, name: 'StemplerInd PostNord pakkeshop' }, { id: 7, name: 'Plejer GLS pakkeshop' }, { id: 8, name: 'Plejer PostNord pakkeshop' }]), { status: 200 });
      return svar();
    }));
    const r = await stripeHaendelse(new Request('https://x/stripe', { method: 'POST', body: krop, headers: { 'stripe-signature': await underskriv(krop, Math.floor(Date.now() / 1000)) } }), env, KATALOG);
    return { r, kald };
  }

  it('afviser falske kald og sender betalte ordrer videre med PostNord-skabelonen', async () => {
    const env = { STRIPE_WEBHOOK_SECRET: HEMMELIG, SHIPMONDO_API_USER: 'u', SHIPMONDO_API_KEY: 'k' };
    const krop = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
    const falsk = new Request('https://x/stripe', { method: 'POST', body: krop, headers: { 'stripe-signature': 't=' + Math.floor(Date.now() / 1000) + ',v1=00' } });
    expect((await stripeHaendelse(falsk, env, KATALOG)).status).toBe(400);

    const { r, kald } = await haendelse(session, () => new Response('{}', { status: 201 }));
    expect(r.status).toBe(200);
    const post = kald.find(([u, m]) => u.endsWith('/sales_orders') && m === 'POST');
    const ordre = JSON.parse(post[2]);
    expect(ordre.shipment_template_id).toBe(8);
    expect(ordre.order_id).toBe('PL-TEST42');
    expect(ordre.service_point.id).toBe('1234');
  });

  it('svarer 200, når ordren findes i forvejen, og 500, når Shipmondo fejler, så Stripe prøver igen', async () => {
    expect((await haendelse(session, () => new Response('{"error":"order_id has already been taken"}', { status: 422 }))).r.status).toBe(200);
    expect((await haendelse(session, () => new Response('nede', { status: 503 }))).r.status).toBe(500);
  });

  it('springer ubetalte sessioner og andre butikkers betalinger over', async () => {
    const ubetalt = await haendelse(Object.assign({}, session, { payment_status: 'unpaid' }), () => new Response('{}', { status: 201 }));
    expect(ubetalt.r.status).toBe(200);
    expect(ubetalt.kald).toHaveLength(0);
    const anden = await haendelse(Object.assign({}, session, { metadata: { kurv: '1xstartpakken', butik: 'stemplerind.dk' } }), () => new Response('{}', { status: 201 }));
    expect(await anden.r.json()).toEqual({ ok: true, 'anden-butik': true });
    expect(anden.kald).toHaveLength(0);
  });
});
