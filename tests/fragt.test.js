// Betalt ordre fra Stripe til Shipmondo: underskriften skal passe, og ordren skal have rigtige beløb, moms og adresse.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tjekUnderskrift, shipmondoOrdre, stripeHaendelse } from '../butik/fragt.js';
import { KATALOG } from '../butik/katalog.js';

const HEMMELIG = 'whsec_test123';
async function underskriv(krop, t, hemmelig = HEMMELIG) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(hemmelig), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t + '.' + krop)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
}

// 1 x pakke 1 (199) + 2 x enkelt mærke (39) + fragt (49) = 326 kr.
const session = {
  id: 'cs_test_abc', object: 'checkout.session', created: 1794300000, currency: 'dkk', payment_status: 'paid', payment_intent: 'pi_123',
  amount_total: 32600, shipping_cost: { amount_total: 4900 },
  metadata: { kurv: '1xpakke-1,2xenkelt-maerke' },
  custom_fields: [{ key: 'maerker', type: 'text', text: { value: ' A3 og B5 ' } }],
  customer_details: { email: 'kunde@example.com', name: 'Kunde Kundesen', phone: null, address: { country: 'DK', postal_code: '2300' } },
  collected_information: { shipping_details: { name: 'Kunde Kundesen', address: { line1: 'Testvej 1', line2: null, postal_code: '2300', city: 'København S', country: 'DK' } } }
};

describe('Stripe til Shipmondo', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('godkender kun Stripes rigtige underskrift', async () => {
    const krop = '{"a":1}', t = 1794300000;
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), HEMMELIG, t)).resolves.toBe(true);
    await expect(tjekUnderskrift(krop, await underskriv(krop, t, 'whsec_forkert'), HEMMELIG, t)).rejects.toThrow('underskrift');
    await expect(tjekUnderskrift('{"a":2}', await underskriv(krop, t), HEMMELIG, t)).rejects.toThrow('underskrift');
    await expect(tjekUnderskrift(krop, await underskriv(krop, t), HEMMELIG, t + 600)).rejects.toThrow('for-gammel');
    await expect(tjekUnderskrift(krop, '', HEMMELIG, t)).rejects.toThrow('underskrift');
  });

  it('laver ordren med varer, Plejers varenumre, fragt, moms og adresse', () => {
    const o = shipmondoOrdre(session, KATALOG, 42);
    expect(o.order_id).toBe('cs_test_abc');
    expect(o.source_name).toBe('plejer.dk');
    expect(o.shipment_template_id).toBe(42);
    expect(o.ship_to).toMatchObject({ name: 'Kunde Kundesen', address1: 'Testvej 1', zipcode: '2300', city: 'København S', country_code: 'DK', email: 'kunde@example.com' });
    expect(o.order_lines).toHaveLength(3);
    expect(o.order_lines[0]).toMatchObject({ line_type: 'item', item_name: 'Pakke 1, 8 hvide mærker', item_sku: 'PL-PAKKE-1', quantity: 1, unit_price_excluding_vat: 159.2, vat_percent: 25 });
    expect(o.order_lines[1]).toMatchObject({ item_name: 'Enkelt mærke: A3 og B5', item_sku: 'PL-ENKELT-MAERKE', quantity: 2, unit_price_excluding_vat: 31.2 });
    expect(o.order_lines[2]).toMatchObject({ line_type: 'shipping', item_name: 'Pakke til pakkeshop med GLS', unit_price_excluding_vat: 39.2 });
    expect(o.payment_details).toMatchObject({ amount_including_vat: 326, amount_excluding_vat: 260.8, vat_amount: 65.2, currency_code: 'DKK', transaction_id: 'pi_123' });
  });

  it('bruger den gamle shipping_details, hvis Stripe sender den', () => {
    const s = Object.assign({}, session, { collected_information: null, shipping_details: { name: 'Gammel Form', address: { line1: 'Vej 2', postal_code: '8000', city: 'Aarhus C', country: 'DK' } } });
    expect(shipmondoOrdre(s, KATALOG).ship_to).toMatchObject({ name: 'Gammel Form', address1: 'Vej 2', city: 'Aarhus C' });
  });

  it('afviser falske kald og sender betalte ordrer videre med Plejer-skabelonen', async () => {
    const env = { STRIPE_WEBHOOK_SECRET: HEMMELIG, SHIPMONDO_API_USER: 'u', SHIPMONDO_API_KEY: 'k' };
    const krop = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
    const t = Math.floor(Date.now() / 1000);
    const falsk = new Request('https://x/stripe', { method: 'POST', body: krop, headers: { 'stripe-signature': 't=' + t + ',v1=00' } });
    expect((await stripeHaendelse(falsk, env, KATALOG)).status).toBe(400);

    const kald = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      kald.push([String(url), init && init.method, init && init.body]);
      if (String(url).includes('shipment_templates')) return new Response(JSON.stringify([{ id: 7, name: 'StemplerInd GLS pakkeshop' }, { id: 9, name: 'Plejer GLS pakkeshop' }]), { status: 200 });
      return new Response('{}', { status: 201 });
    }));
    const ok = new Request('https://x/stripe', { method: 'POST', body: krop, headers: { 'stripe-signature': await underskriv(krop, t) } });
    const r = await stripeHaendelse(ok, env, KATALOG);
    expect(r.status).toBe(200);
    const post = kald.find(([u, m]) => u.endsWith('/sales_orders') && m === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post[2]).shipment_template_id).toBe(9);
  });
});
