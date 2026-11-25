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
  // Ordrenummeret, fx PL-7KQ2MX. Står på takkesiden, i Stripe og i Shipmondo.
  ordrePraefiks: 'PL-',
  skuPraefiks: 'PL-',
  // Forsendelsesskabelonerne i Shipmondo hedder "Plejer GLS pakkeshop" og "Plejer PostNord pakkeshop".
  // Kunden vælger fragtfirma i kurven. Shipmondo finder pakkeshoppen nærmest kundens adresse.
  skabelon: 'Plejer',
  // Plejer har sin egen Stripe-konto. Kontoudtogsteksten PLEJER.DK står i kontoens indstillinger, ikke her.
  // Moms beregnes af Stripe Tax (inkl. i prisen), så kvitteringen viser momsen, også af fragten.
  stripeTax: true,
  fragt: {
    oere: 4900,
    // {firma} bliver til GLS eller PostNord
    navn: { da: '{firma} pakkeshop nærmest din adresse' },
    til: { da: 'Vi sender pakken til den {firma} pakkeshop, der ligger nærmest adressen herunder. Du får besked på sms og mail, når den kan hentes.' }
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
    }
  }
};
