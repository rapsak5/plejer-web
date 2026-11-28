// Kassen til Plejers webshop: kurven tjekkes, og priserne kommer fra kataloget, ikke fra browseren.
// Bygget på StemplerInds test fra 24. nov. 2026.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker, { tjekKurv, sessionFelter, UDELUKKET, nytOrdrenummer, ordreResume, tjekPakkeshop } from '../butik/worker.js';
import { KATALOG } from '../butik/katalog.js';
import { kurvDataFil, versioner } from '../butik/konfigurer.mjs';

const fil = n => readFileSync(new URL('../' + n, import.meta.url), 'utf8');
const SHOPS = [{ id: '1234', navn: 'Netto Amagerbrogade', adresse: 'Amagerbrogade 1', postnr: '2300', by: 'København S', afstand: 300 }];
const opslag = async (firma, postnr) => (firma === 'gls' && postnr === '2300' ? SHOPS : []);

describe('kassen', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('kataloget har de tre pakker med priser i øre og fragt, ingen enkelte mærker', () => {
    expect(Object.keys(KATALOG.varer)).toEqual(['pakke-1', 'pakke-2', 'samlet-pakke']);
    for (const v of Object.values(KATALOG.varer)) expect(Number.isInteger(v.oere) && v.oere > 0).toBe(true);
    expect(KATALOG.fragt.oere).toBe(4900);
  });

  it('afviser tom kurv, ukendte varer og forkerte antal', () => {
    expect(() => tjekKurv([])).toThrow('tom');
    expect(() => tjekKurv(null)).toThrow('tom');
    expect(() => tjekKurv([{ id: 'gratis-pakke', antal: 1 }])).toThrow('ukendt-vare');
    expect(() => tjekKurv([{ id: 'toString', antal: 1 }])).toThrow('ukendt-vare');
    expect(() => tjekKurv([{ id: '__proto__', antal: 1 }])).toThrow('ukendt-vare');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 0 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 1.5 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 51 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: '2' }])).not.toThrow();
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 30 }, { id: 'pakke-1', antal: 30 }])).toThrow('forkert-antal');
    expect(() => tjekKurv(Array.from({ length: 13 }, () => ({ id: 'pakke-1', antal: 1 })))).toThrow('for-mange-linjer');
  });

  it('lægger samme vare sammen', () => {
    const l = tjekKurv([{ id: 'pakke-1', antal: 1 }, { id: 'pakke-1', antal: 2 }]);
    expect(l).toHaveLength(1);
    expect(l[0].antal).toBe(3);
  });

  it('bruger katalogets pris, også hvis browseren sender en anden', () => {
    const f = sessionFelter({ varer: [{ id: 'samlet-pakke', antal: 2, pris: 1, oere: 1 }, { id: 'pakke-2', antal: 1 }], sprog: 'da' });
    expect(f.get('line_items[0][price_data][unit_amount]')).toBe(String(KATALOG.varer['samlet-pakke'].oere));
    expect(f.get('line_items[0][quantity]')).toBe('2');
    expect(f.get('line_items[1][price_data][product_data][name]')).toBe(KATALOG.varer['pakke-2'].navn.da);
    expect(f.get('line_items[0][price_data][currency]')).toBe('dkk');
    expect(f.get('locale')).toBe('da');
    expect(f.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')).toBe('4900');
    expect(f.get('shipping_address_collection[allowed_countries][0]')).toBe('DK');
    expect(f.get('success_url')).toBe('https://plejer.dk/tak.html?id={CHECKOUT_SESSION_ID}');
    expect(f.get('cancel_url')).toBe('https://plejer.dk/#pakker');
    expect(f.get('custom_text[submit][message]')).toContain('plejer.dk/betingelser.html');
    expect([...f.keys()].some(k => k.startsWith('custom_fields'))).toBe(false);
  });

  it('beder om telefonnummer på betalingssiden', () => {
    expect(sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }).get('phone_number_collection[enabled]')).toBe('true');
  });

  it('slår pakkeshoppen op igen og afviser et falsk id', async () => {
    const shop = await tjekPakkeshop({ firma: 'gls', postnr: '2300', id: '1234', navn: 'Falsk navn', adresse: 'Falsk vej' }, {}, opslag);
    expect(shop).toEqual(Object.assign({ firma: 'gls' }, SHOPS[0]));
    await expect(tjekPakkeshop({ firma: 'gls', postnr: '2300', id: '9999' }, {}, opslag)).rejects.toThrow('pakkeshop');
    await expect(tjekPakkeshop({ firma: 'dhl', postnr: '2300', id: '1234' }, {}, opslag)).rejects.toThrow('pakkeshop');
    await expect(tjekPakkeshop({ firma: 'gls', postnr: '23', id: '1234' }, {}, opslag)).rejects.toThrow('pakkeshop');
    await expect(tjekPakkeshop({ firma: 'gls', postnr: '2300', id: '<script>' }, {}, opslag)).rejects.toThrow('pakkeshop');
    await expect(tjekPakkeshop(null, {}, opslag)).rejects.toThrow('pakkeshop');
  });

  it('viser den valgte pakkeshop hos Stripe og gemmer den i metadata', async () => {
    const shop = await tjekPakkeshop({ firma: 'gls', postnr: '2300', id: '1234' }, {}, opslag);
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }, KATALOG, 'PL-TEST01', shop);
    expect(f.get('shipping_options[0][shipping_rate_data][display_name]')).toBe('GLS pakkeshop: Netto Amagerbrogade');
    expect(f.get('custom_text[shipping_address][message]')).toContain('Netto Amagerbrogade, Amagerbrogade 1, 2300 København S');
    expect(f.get('metadata[fragtfirma]')).toBe('gls');
    expect(f.get('metadata[pakkeshop_id]')).toBe('1234');
    expect(f.get('metadata[pakkeshop_navn]')).toBe('Netto Amagerbrogade');
    expect(f.get('metadata[pakkeshop_adresse]')).toBe('Amagerbrogade 1');
    expect(f.get('metadata[pakkeshop_postnr]')).toBe('2300');
    expect(f.get('metadata[pakkeshop_by]')).toBe('København S');
    const lang = Object.assign({}, shop, { navn: 'X'.repeat(200) });
    expect(sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }, KATALOG, 'PL-TEST01', lang).get('shipping_options[0][shipping_rate_data][display_name]').length).toBe(100);
    // En ældre kurv uden pakkeshop kan stadig betale i overgangen
    const uden = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' });
    expect(uden.get('metadata[pakkeshop_id]')).toBeNull();
    expect(uden.get('shipping_options[0][shipping_rate_data][display_name]')).toBe(KATALOG.fragt.navn.da);
  });

  it('beregner momsen med Stripe Tax inkl. i prisen, også af fragten', () => {
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }, { id: 'pakke-2', antal: 2 }], sprog: 'da' });
    expect(f.get('automatic_tax[enabled]')).toBe('true');
    expect(f.get('line_items[0][price_data][tax_behavior]')).toBe('inclusive');
    expect(f.get('line_items[1][price_data][tax_behavior]')).toBe('inclusive');
    expect(f.get('line_items[0][price_data][product_data][tax_code]')).toBe('txcd_99999999');
    expect(f.get('shipping_options[0][shipping_rate_data][tax_behavior]')).toBe('inclusive');
    expect(f.get('shipping_options[0][shipping_rate_data][tax_code]')).toBe('txcd_92010001');
    // Slås Stripe Tax fra i kataloget, sendes ingen momsfelter
    const uden = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }, Object.assign({}, KATALOG, { stripeTax: false }));
    expect([...uden.keys()].some(k => k.includes('tax'))).toBe(false);
  });

  it('spørger på betalingssiden, hvis en vare har et spørgsmål', () => {
    const K = Object.assign({}, KATALOG, { varer: Object.assign({}, KATALOG.varer, { prove: { oere: 100, navn: { da: 'Prøve' }, spoerg: { noegle: 'farve', tekst: { da: 'Hvilken farve?' } } } }) });
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }, { id: 'prove', antal: 1 }], sprog: 'da' }, K);
    expect(f.get('custom_fields[0][key]')).toBe('farve');
    expect(f.get('custom_fields[0][type]')).toBe('text');
    expect(f.get('custom_fields[0][label][custom]').length).toBeLessThanOrEqual(50);
  });

  it('udelukker Klarna og andre køb nu, betal senere', () => {
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' });
    const udelukket = [...f.entries()].filter(([k]) => k.startsWith('excluded_payment_method_types')).map(([, v]) => v);
    expect(udelukket).toEqual(['klarna', 'affirm', 'afterpay_clearpay', 'alma', 'billie', 'scalapay', 'sequra', 'sunbit', 'zip']);
    expect(udelukket).toEqual(UDELUKKET);
    expect([...f.keys()].some(k => k.startsWith('payment_method_types'))).toBe(false);
    expect(JSON.stringify([...f.values()])).not.toMatch(/mobilepay/i);
  });

  it('bruger nb for norsk hos Stripe', () => {
    const K = Object.assign({}, KATALOG, { sti: { da: '', no: 'no/' } });
    expect(sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'no' }, K).get('locale')).toBe('nb');
    expect(sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'xx' }).get('locale')).toBe('da');
  });

  it('giver hver betaling et kort ordrenummer, som også står i Stripe', () => {
    expect(nytOrdrenummer()).toMatch(/^PL-[A-HJ-NP-Z2-9]{6}$/);
    expect(nytOrdrenummer(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe('PL-ABCDEF');
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }, KATALOG, 'PL-TEST42');
    expect(f.get('metadata[ordre]')).toBe('PL-TEST42');
    expect(f.get('payment_intent_data[metadata][ordre]')).toBe('PL-TEST42');
    expect(f.get('payment_intent_data[description]')).toBe('Plejer PL-TEST42');
    expect(f.get('metadata[butik]')).toBe('plejer.dk');
    expect(f.get('payment_intent_data[statement_descriptor_suffix]')).toBeNull();
  });

  it('takkesiden får varer, fragt, total, moms og pakkeshop, men intet om kortet', () => {
    const nu = 1795000000;
    const s = {
      id: 'cs_test_abc', created: nu - 60, livemode: false, currency: 'dkk', payment_status: 'paid', amount_total: 32600,
      metadata: { ordre: 'PL-TEST42', kurv: '1xpakke-1,2xpakke-2', fragtfirma: 'postnord', pakkeshop_id: '1234', pakkeshop_navn: 'Netto', pakkeshop_adresse: 'Amagerbrogade 1', pakkeshop_postnr: '2300', pakkeshop_by: 'København S' },
      shipping_cost: { amount_total: 4900 },
      customer_details: { email: 'kunde@example.dk', name: 'Kort Navn', phone: '+4524425425' },
      collected_information: { shipping_details: { name: 'Ane Kunde', address: { line1: 'Vej 1', line2: null, postal_code: '2300', city: 'København S', country: 'DK' } } },
      line_items: { data: [{ description: 'Pakke 1, 8 hvide mærker', quantity: 1, amount_total: 19900 }, { description: 'Enkelt mærke', quantity: 2, amount_total: 7800 }] },
      payment_method_types: ['card'], payment_method_options: { card: { request_three_d_secure: 'automatic' } }
    };
    const o = ordreResume(s, nu);
    expect(o).toMatchObject({ ordre: 'PL-TEST42', betalt: true, test: true, total: 32600, fragt: 4900, moms: 6520, mail: 'kunde@example.dk', valuta: 'DKK' });
    expect(o.varer).toEqual([{ navn: 'Pakke 1, 8 hvide mærker', antal: 1, beloeb: 19900 }, { navn: 'Enkelt mærke', antal: 2, beloeb: 7800 }]);
    expect(o.pakkeshop).toEqual({ firma: 'PostNord', navn: 'Netto', adresse: 'Amagerbrogade 1', postnr: '2300', by: 'København S' });
    expect(JSON.stringify(o)).not.toMatch(/card|payment_method|three_d|\+45/);
    // Stripe Tax: momsen tages fra Stripe, når den findes
    expect(ordreResume(Object.assign({}, s, { total_details: { amount_tax: 6520, amount_shipping: 4900 } }), nu).moms).toBe(6520);
    expect(ordreResume(Object.assign({}, s, { payment_status: 'unpaid' }), nu).betalt).toBe(false);
    expect(() => ordreResume(s, nu + 31 * 86400)).toThrow('udloebet');
    expect(ordreResume(Object.assign({}, s, { shipping_cost: null, total_details: { amount_shipping: 4900 } }), nu).fragt).toBe(4900);
    expect(ordreResume(Object.assign({}, s, { shipping_cost: null }), nu).fragt).toBe(4900);
    expect(() => ordreResume({ id: 'pi_123' }, nu)).toThrow('ikke-fundet');
  });
});

describe('kassen som Worker', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const env = { STRIPE_SECRET_KEY: 'rk_test_x', SHIPMONDO_API_USER: 'u', SHIPMONDO_API_KEY: 'k', STRIPE_WEBHOOK_SECRET: 'whsec_x' };
  const kald = (sti, init = {}, origin = 'https://plejer.dk') => worker.fetch(new Request('https://plejer-butik.stemplerind.workers.dev' + sti, Object.assign({ headers: { origin, 'content-type': 'application/json' } }, init)), env);
  function falskeTjenester(stripe = []) {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/pickup_points')) return new Response(JSON.stringify([{ number: '1234', company_name: 'Netto Amagerbrogade', address: 'Amagerbrogade 1', zipcode: '2300', city: 'KØBENHAVN S' }]), { status: 200 });
      if (u.includes('api.stripe.com')) { stripe.push(new URLSearchParams(init.body)); return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 }); }
      return new Response('{}', { status: 404 });
    }));
  }

  it('statuslampen viser butik, test og Shipmondo', async () => {
    const r = await kald('/');
    expect(await r.json()).toEqual({ ok: true, butik: 'plejer.dk', test: true, shipmondo: true });
  });

  it('kun plejer.dk og www.plejer.dk må bruge kassen', async () => {
    expect((await kald('/kasse', { method: 'OPTIONS' })).headers.get('access-control-allow-origin')).toBe('https://plejer.dk');
    expect((await kald('/kasse', { method: 'OPTIONS' }, 'https://www.plejer.dk')).status).toBe(204);
    expect((await kald('/kasse', { method: 'POST', body: '{}' }, 'https://stemplerind.dk')).status).toBe(403);
    expect((await kald('/pakkeshops?firma=gls&postnr=2300', {}, 'https://ond.example')).status).toBe(403);
    expect((await kald('/ordre?id=cs_test_abcdefghijkl', {}, 'https://ond.example')).status).toBe(403);
  });

  it('DAO (brev) betaler uden pakkeshop og sendes til adressen fra Stripe', async () => {
    const stripe = [];
    falskeTjenester(stripe);
    const r = await kald('/kasse', { method: 'POST', body: JSON.stringify({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da', fragtfirma: 'dao' }) });
    expect((await r.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(stripe[0].get('metadata[fragtfirma]')).toBe('dao');
    expect(stripe[0].get('metadata[pakkeshop_id]')).toBeNull();
    expect(stripe[0].get('shipping_options[0][shipping_rate_data][display_name]')).toBe(KATALOG.fragt.hjem.da);
    expect(stripe[0].get('custom_text[shipping_address][message]')).toContain('postkasse');
    // Et ukendt fragtfirma uden pakkeshop giver bare den almindelige fragt
    const dhl = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' }, KATALOG, 'PL-X', null, 'dhl');
    expect(dhl.get('metadata[fragtfirma]')).toBeNull();
    expect((await kald('/pakkeshops?firma=dao&postnr=2300')).status).toBe(400);
  });

  it('afviser et falsk pakkeshop-id ved betaling og laver betalingen med et rigtigt', async () => {
    const stripe = [];
    falskeTjenester(stripe);
    const falsk = await kald('/kasse', { method: 'POST', body: JSON.stringify({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da', pakkeshop: { firma: 'gls', postnr: '2300', id: '9999' } }) });
    expect(falsk.status).toBe(400);
    expect(await falsk.json()).toEqual({ fejl: 'pakkeshop' });
    expect(stripe).toHaveLength(0);
    const ok = await kald('/kasse', { method: 'POST', body: JSON.stringify({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da', pakkeshop: { firma: 'gls', postnr: '2300', id: '1234' } }) });
    expect((await ok.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(stripe[0].get('metadata[pakkeshop_by]')).toBe('København S');
    expect(stripe[0].get('metadata[ordre]')).toMatch(/^PL-/);
  });

  it('pakkeshop-listen kommer fra Shipmondo med pæne bynavne', async () => {
    falskeTjenester();
    const r = await kald('/pakkeshops?firma=postnord&postnr=2300');
    expect((await r.json()).pakkeshops[0]).toMatchObject({ id: '1234', by: 'København S' });
    expect((await kald('/pakkeshops?firma=dhl&postnr=2300')).status).toBe(400);
    expect((await kald('/pakkeshops?firma=gls&postnr=23')).status).toBe(400);
    expect(String(fetch.mock.calls[0][0])).toContain('carrier_code=pdk&country_code=DK&zipcode=2300&quantity=25');
  });

  it('takkesiden kan kun hente ordrer med et rigtigt session-id', async () => {
    falskeTjenester();
    expect((await kald('/ordre?id=pi_123')).status).toBe(400);
    expect((await kald('/ordre?id=cs_test_../../x')).status).toBe(400);
  });
});

describe('hjemmesiden passer til kassen', () => {
  const sider = readdirSync(new URL('../', import.meta.url)).filter(n => n.endsWith('.html'));

  it('kurv-data.js er lavet ud fra det nuværende katalog', () => {
    expect(fil('kurv-data.js')).toBe(kurvDataFil());
  });

  it('kurv.js, kurv-data.js og stil.css har en versionsnøgle, der passer til filen', () => {
    const v = versioner();
    for (const n of ['kurv.js', 'kurv-data.js', 'stil.css']) expect(v[n]).toBe(createHash('sha256').update(readFileSync(new URL('../' + n, import.meta.url))).digest('hex').slice(0, 10));
    const index = fil('index.html');
    expect(index).toContain('src="kurv.js?v=' + v['kurv.js'] + '"');
    expect(index).toContain('src="kurv-data.js?v=' + v['kurv-data.js'] + '"');
    for (const n of sider) {
      const html = fil(n);
      if (/href="\/?stil\.css/.test(html)) expect(html, n).toMatch(new RegExp('href="/?stil\\.css\\?v=' + v['stil.css'] + '"'));
      expect(html, n).not.toMatch(/src="kurv\.js"/);
    }
  });

  it('priserne og knapperne på forsiden passer til kataloget', () => {
    const html = fil('index.html');
    const kr = id => String(KATALOG.varer[id].oere / 100);
    for (const id of ['pakke-1', 'pakke-2', 'samlet-pakke']) {
      const m = html.match(new RegExp('<span class="pris">(\\d+)<small>kr\\.</small></span><a [^>]*data-kurv="' + id + '"'));
      expect(m, id).toBeTruthy();
      expect(m[1]).toBe(kr(id));
    }
    expect(html).not.toMatch(/enkelte mærker|enkelt-maerke/i);
    expect(html).toContain('Fragt ' + KATALOG.fragt.oere / 100 + ' kr.');
    for (const [, id] of html.matchAll(/data-kurv="([^"]+)"/g)) expect(KATALOG.varer[id], id).toBeTruthy();
  });

  it('alle sider linker til handelsbetingelser og fortrydelsesknappen', () => {
    for (const n of sider.filter(n => n !== '404.html' && !/^google|BingSite/.test(n))) {
      const html = fil(n);
      if (n !== 'fortryd.html') expect(html, n).toContain('href="fortryd.html"');
      if (n !== 'betingelser.html') expect(html, n).toContain('href="betingelser.html"');
    }
  });

  it('handelsbetingelserne har det, loven kræver', () => {
    const b = fil('betingelser.html');
    for (const t of ['CVR 40989102', 'Ove Billes Vej 7', 'inkl. 25 % moms', 'Fragt koster ' + KATALOG.fragt.oere / 100 + ' kr.', 'DAO (brev)', 'postkasse', 'GLS eller PostNord', 'pakkeshop', '3 hverdage', '14 dages fortrydelsesret', '2 års reklamationsret', 'Nævnenes Hus', 'Standardfortrydelsesformular']) expect(b, t).toContain(t);
  });

  it('privatlivspolitikken nævner kurven, Stripe, Shipmondo, fragtfirmaet og postnummeret', () => {
    const p = fil('privatliv.html');
    for (const t of ['kurven kun i din egen browser', 'Stripe', 'Shipmondo og fragtfirmaet (DAO, GLS eller PostNord)', 'telefonnummer', 'den pakkeshop, du har valgt', 'Postnummeret, du søger pakkeshops med, sendes til Shipmondo og gemmes ikke']) expect(p, t).toContain(t);
  });

  it('fortrydelsesknappen har to trin og kvittering med tidspunkt', () => {
    const f = fil('fortryd.html');
    expect(f).toContain('Fortryd købet');
    expect(f).toContain('Bekræft fortrydelse');
    expect(f).toContain('_autoresponse');
    expect(f).toMatch(/tidspunkt/i);
  });

  it('takkesiden tjekker session-id, tømmer kurven og viser pakkeshop og moms', () => {
    const t = fil('tak.html');
    expect(t).toContain('cs_(test|live)_');
    expect(t).toContain("localStorage.removeItem('plejer-kurv')");
    expect(t).toContain('o-shop');
    expect(t).toContain('o-moms');
    expect(t).toContain('noindex');
    expect(t).toContain(KATALOG.api);
  });

  it('kunden vælger pakkeshoppen i en dropdown med listen fra kassen', () => {
    const k = fil('kurv.js');
    expect(k).toContain('<select class="kurv-shops"');
    expect(k).toContain("K.api + '/pakkeshops?firma='");
    expect(k).toContain('krop.pakkeshop = { firma: valg.firma, postnr: valg.soeg, id: valg.shop.id }');
  });

  it('DAO (brev) er det første og forvalgte fragtvalg, GLS og PostNord kan stadig vælges', () => {
    const k = fil('kurv.js');
    expect(k).toContain("var FIRMAER = [['dao', 'DAO (brev)', true], ['gls', 'GLS'], ['postnord', 'PostNord']];");
    expect(k).toContain('valg.firma = FIRMAER[0][0]');
    expect(k).toContain('krop.fragtfirma = valg.firma');
    for (const n of ['index.html', 'betingelser.html', 'tak.html']) expect(fil(n), n).toContain('DAO (brev)');
  });

  it('workflowet prøver pakkeshops og en rigtig betalingsside efter udgivelsen', () => {
    const w = fil('.github/workflows/butik.yml');
    expect(w).toContain('/pakkeshops?firma=gls&postnr=2300');
    expect(w).toContain('\\"pakkeshop\\"');
    expect(w).toContain("tr -d '\\r\\n'");
    expect(w).toContain('wrangler@4 deploy');
  });
});
