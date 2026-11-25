// Laver kurv-data.js til hjemmesiden ud fra butik/katalog.js, så kurven og kassen altid har samme priser.
// Sætter også versionsnøgler på kurv.js, kurv-data.js og stil.css i alle sider (fx kurv.js?v=1a2b3c4d5e),
// så browserne henter de nye filer med det samme efter en udgivelse. Det gik galt hos StemplerInd uden.
// Kør efter hver ændring i kataloget, kurven eller stil.css: node butik/konfigurer.mjs
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  kurvLevering: 'Levering til pakkeshop',
  kurvPostnr: 'Dit postnummer',
  kurvFind: 'Find pakkeshops',
  kurvVaelg: 'Vælg en pakkeshop, før du betaler.',
  kurvIngen: 'Vi fandt ingen pakkeshops ved det postnummer. Prøv et andet.',
  kurvShopFejl: 'Pakkeshops kunne ikke hentes lige nu. Prøv igen om lidt.',
  kurvPostnrFejl: 'Skriv et postnummer med 4 cifre.',
  kurvSkift: 'Skift',
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

const rod = n => fileURLToPath(new URL('../' + n, import.meta.url));
const VERSIONERET = ['kurv.js', 'kurv-data.js', 'stil.css'];

// Versionsnøglen er de første 10 tegn af filens SHA-256. Den skifter kun, når filen ændres.
export function versioner(laes = n => readFileSync(rod(n))) {
  return Object.fromEntries(VERSIONERET.map(n => [n, createHash('sha256').update(laes(n)).digest('hex').slice(0, 10)]));
}

// Sætter ?v=<nøgle> på henvisninger til filerne, fx src="kurv.js" og href="/stil.css?v=gammel"
export function saetVersioner(html, v) {
  return VERSIONERET.reduce((h, n) => h.replace(new RegExp('((?:src|href)="/?' + n.replace('.', '\\.') + ')(\\?v=[0-9a-f]*)?"', 'g'), '$1?v=' + v[n] + '"'), html);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(rod('kurv-data.js'), kurvDataFil());
  console.log('Skrev kurv-data.js');
  const v = versioner();
  for (const n of readdirSync(rod('.')).filter(n => n.endsWith('.html'))) {
    const gammel = readFileSync(rod(n), 'utf8'), ny = saetVersioner(gammel, v);
    if (ny !== gammel) { writeFileSync(rod(n), ny); console.log('Versioner i ' + n); }
  }
}
