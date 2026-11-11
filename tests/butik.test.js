// Kassen til Plejers webshop: kurven tjekkes, og priserne kommer fra kataloget, ikke fra browseren.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tjekKurv, sessionFelter, UDELUKKET } from '../butik/worker.js';
import { KATALOG } from '../butik/katalog.js';
import { kurvDataFil } from '../butik/konfigurer.mjs';

const fil = n => readFileSync(new URL('../' + n, import.meta.url), 'utf8');

describe('kassen', () => {
  it('kataloget har de fire varer med priser i øre og fragt', () => {
    expect(Object.keys(KATALOG.varer)).toEqual(['pakke-1', 'pakke-2', 'samlet-pakke', 'enkelt-maerke']);
    for (const v of Object.values(KATALOG.varer)) expect(Number.isInteger(v.oere) && v.oere > 0).toBe(true);
    expect(KATALOG.fragt.oere).toBe(4900);
  });

  it('afviser tom kurv, ukendte varer og forkerte antal', () => {
    expect(() => tjekKurv([])).toThrow('tom');
    expect(() => tjekKurv([{ id: 'gratis-pakke', antal: 1 }])).toThrow('ukendt-vare');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 0 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 1.5 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 51 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'pakke-1', antal: 30 }, { id: 'pakke-1', antal: 30 }])).toThrow('forkert-antal');
    expect(() => tjekKurv([{ id: 'toString', antal: 1 }])).toThrow('ukendt-vare');
  });

  it('lægger samme vare sammen', () => {
    const l = tjekKurv([{ id: 'pakke-1', antal: 1 }, { id: 'pakke-1', antal: 2 }]);
    expect(l).toHaveLength(1);
    expect(l[0].antal).toBe(3);
  });

  it('bruger kataloget pris, også hvis browseren sender en anden', () => {
    const f = sessionFelter({ varer: [{ id: 'samlet-pakke', antal: 2, pris: 1, oere: 1 }, { id: 'pakke-2', antal: 1 }], sprog: 'da' });
    expect(f.get('line_items[0][price_data][unit_amount]')).toBe(String(KATALOG.varer['samlet-pakke'].oere));
    expect(f.get('line_items[0][quantity]')).toBe('2');
    expect(f.get('line_items[1][price_data][product_data][name]')).toBe(KATALOG.varer['pakke-2'].navn.da);
    expect(f.get('line_items[0][price_data][currency]')).toBe('dkk');
    expect(f.get('locale')).toBe('da');
    expect(f.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')).toBe('4900');
    expect(f.get('shipping_address_collection[allowed_countries][0]')).toBe('DK');
    expect(f.get('success_url')).toBe('https://plejer.dk/?koeb=tak#pakker');
    expect(f.get('cancel_url')).toBe('https://plejer.dk/#pakker');
    expect(f.get('custom_text[submit][message]')).toContain('plejer.dk/betingelser.html');
    expect([...f.keys()].some(k => k.startsWith('custom_fields'))).toBe(false);
  });

  it('spørger efter hvilke mærker, når der er enkelte mærker i kurven', () => {
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }, { id: 'enkelt-maerke', antal: 3 }], sprog: 'da' });
    expect(f.get('custom_fields[0][key]')).toBe('maerker');
    expect(f.get('custom_fields[0][type]')).toBe('text');
    expect(f.get('custom_fields[0][label][custom]').length).toBeLessThanOrEqual(50);
  });

  it('udelukker Klarna og andre køb nu, betal senere', () => {
    const f = sessionFelter({ varer: [{ id: 'pakke-1', antal: 1 }], sprog: 'da' });
    const udelukket = [...f.entries()].filter(([k]) => k.startsWith('excluded_payment_method_types')).map(([, v]) => v);
    expect(udelukket).toEqual(['klarna', 'affirm', 'afterpay_clearpay', 'alma', 'billie', 'scalapay', 'sequra', 'sunbit', 'zip']);
    expect(udelukket).toEqual(UDELUKKET);
    expect([...f.keys()].some(k => k.startsWith('payment_method_types'))).toBe(false);
  });
});

describe('hjemmesiden passer til kataloget', () => {
  it('kurv-data.js er lavet ud fra det nuværende katalog', () => {
    expect(fil('kurv-data.js')).toBe(kurvDataFil());
  });

  it('priserne og knapperne på forsiden passer til kataloget', () => {
    const html = fil('index.html');
    const kr = id => String(KATALOG.varer[id].oere / 100);
    for (const id of ['pakke-1', 'pakke-2', 'samlet-pakke']) {
      const m = html.match(new RegExp('<span class="pris">(\\d+)<small>kr\\.</small></span><a [^>]*data-kurv="' + id + '"'));
      expect(m, id).toBeTruthy();
      expect(m[1]).toBe(kr(id));
    }
    expect(html).toContain('Enkelte mærker til efterbestilling: ' + kr('enkelt-maerke') + ' kr.');
    expect(html).toContain('Fragt ' + KATALOG.fragt.oere / 100 + ' kr.');
    for (const [, id] of html.matchAll(/data-kurv="([^"]+)"/g)) expect(KATALOG.varer[id], id).toBeTruthy();
    expect(html).toContain('href="betingelser.html"');
    expect(html).toContain('href="fortryd.html"');
  });

  it('handelsbetingelserne nævner samme fragt', () => {
    expect(fil('betingelser.html')).toContain('Fragt koster ' + KATALOG.fragt.oere / 100 + ' kr.');
  });
});
