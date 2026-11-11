// Laver kurv-data.js til hjemmesiden ud fra butik/katalog.js, så kurven og kassen altid har samme priser.
// Kør efter hver ændring i kataloget: node butik/konfigurer.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KATALOG } from './katalog.js';

export const TEKSTER = {
  kurvLaeg: 'Læg i kurv',
  kurvLagt: 'Lagt i kurven',
  kurv: 'Kurv',
  kurvTitel: 'Din kurv',
  kurvTom: 'Kurven er tom.',
  kurvFragt: 'Fragt',
  kurvIalt: 'I alt',
  kurvBetal: 'Gå til betaling',
  kurvFjern: 'Fjern',
  kurvLuk: 'Luk',
  kurvFlere: 'Én mere',
  kurvFaerre: 'Én mindre',
  kurvTak: 'Tak for din ordre. Kvitteringen kommer på mail.',
  kurvFejl: 'Betalingen kunne ikke startes. Prøv igen, eller skriv til {mail}.',
  kurvVent: 'Et øjeblik',
  kurvStripe: 'Betalingen sker hos Stripe.',
  kurvVilkaar: 'Handelsbetingelser og fortrydelsesret'
};

export function kurvData(K = KATALOG) {
  return {
    api: String(K.api || '').replace(/\/+$/, ''),
    aaben: !!K.aaben,
    sprog: 'da',
    mail: K.mail,
    fragt: K.fragt.oere / 100,
    fmt: { foer: '', sep: '.', efter: ' kr.' },
    varer: Object.fromEntries(Object.entries(K.varer).map(([id, v]) => [id, { navn: v.navn.da, pris: v.oere / 100 }])),
    t: TEKSTER
  };
}

export function kurvDataFil(K = KATALOG) {
  return '// Lavet af butik/konfigurer.mjs ud fra butik/katalog.js. Ret ikke her.\nwindow.KURV = ' + JSON.stringify(kurvData(K), null, 1).replace(/</g, '\\u003c') + ';\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fil = fileURLToPath(new URL('../kurv-data.js', import.meta.url));
  writeFileSync(fil, kurvDataFil());
  console.log('Skrev kurv-data.js');
}
