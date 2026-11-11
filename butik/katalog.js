// Plejers katalog. Den eneste kilde til priser, varer og fragt.
// Kassen hos Cloudflare (worker.js) slår priserne op her. Kurven på plejer.dk får sine tal fra
// kurv-data.js, som laves herfra med: node butik/konfigurer.mjs
// Priser i øre inkl. 25 % moms.
//
// api:   kassens adresse hos Cloudflare.
// aaben: false = kurven vises kun med ?butik=test i adressen. true = kurven er åben for alle.

export const KATALOG = {
  domaene: 'plejer.dk',
  api: 'https://plejer-butik.stemplerind.workers.dev',
  aaben: false,
  mail: 'kasper@ai-workshop.dk',
  valuta: 'dkk',
  sti: { da: '' },
  lande: ['DK'],
  skuPraefiks: 'PL-',
  skabelon: 'Plejer',
  fragt: {
    oere: 4900,
    navn: { da: 'Pakke til pakkeshop med GLS' }
  },
  vilkaar: {
    da: 'Ved at betale accepterer du handelsbetingelserne på plejer.dk/betingelser.html. Du har 14 dages fortrydelsesret.'
  },
  varer: {
    'pakke-1': {
      oere: 19900,
      navn: { da: 'Pakke 1, 8 hvide mærker' }
    },
    'pakke-2': {
      oere: 19900,
      navn: { da: 'Pakke 2, 8 sorte mærker' }
    },
    'samlet-pakke': {
      oere: 34900,
      navn: { da: 'Samlet pakke, 16 mærker' }
    },
    'enkelt-maerke': {
      oere: 3900,
      navn: { da: 'Enkelt mærke' },
      // Kunden skriver på Stripes betalingsside, hvilke mærker det skal være. Teksten kommer med på ordren i Shipmondo.
      spoerg: { noegle: 'maerker', tekst: { da: 'Hvilke enkelte mærker? Fx A3 og B5' } }
    }
  }
};
