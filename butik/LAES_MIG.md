# Kassen til Plejers webshop

Samme opbygning som StemplerInd. Kurven ligger i kundens browser på plejer.dk. Når kunden trykker Gå til betaling, sender kurven varer og antal til kassen her. Kassen er en Cloudflare Worker. Den slår priserne op i `katalog.js` og sender kunden videre til Stripes betalingsside. Når kunden har betalt, opretter kassen ordren i Shipmondo.

Ingen faste udgifter: Cloudflares gratis plan, Shipmondos gratis plan og Stripes gebyr pr. betaling (1,5 % + 1,80 kr. for danske kort, plus 0,5 % til Stripe Tax).

| Fil | Hvad |
| --- | --- |
| `katalog.js` | Priser, varer, fragt, kassens adresse og om butikken er åben. Den eneste kilde til priser |
| `konfigurer.mjs` | Laver `../kurv-data.js` til hjemmesiden ud fra kataloget |
| `worker.js` | Kassen. Tjekker kurven og pakkeshoppen, laver betalingen hos Stripe og viser ordren på takkesiden |
| `fragt.js` | Pakkeshops fra Shipmondo og betalte ordrer fra Stripe til Shipmondo |
| `wrangler.toml` | Navnet på kassen hos Cloudflare: `plejer-butik` |
| `../kurv.js` | Kurven på hjemmesiden |
| `../tak.html` | Takkesiden efter betaling |
| `../betingelser.html`, `../fortryd.html` | Handelsbetingelser og fortrydelsesknappen |
| `../.github/workflows/butik.yml` | Tester og udgiver kassen |

## Ændre priser eller varer

1. Ret `katalog.js`.
2. Kør `node butik/konfigurer.mjs`.
3. Ret prisen i `index.html` og fragten i `betingelser.html`, hvis den er ændret.
4. Kør `npm test`. Testene fejler, hvis hjemmesiden og kataloget ikke passer sammen.
5. Commit og push. Workflowet udgiver kassen.

## Åbne butikken

`aaben: false` i `katalog.js` betyder, at plejer.dk ser ud som før: knapperne hedder Bestil og går til kontakt. Kurven kommer kun frem, når adressen er `https://plejer.dk/?butik=test`. Det huskes i fanen, også efter turen forbi Stripe.

Når mærkerne er klar og testen er gået godt: sæt `aaben: true`, kør `node butik/konfigurer.mjs`, commit og push.

## Opsætning

Kasper taster selv alle nøgler. De lægges som hemmeligheder i GitHub og aldrig i koden. Gem dem i adgangskodemanageren, for GitHub viser dem ikke igen. Workflowet fjerner linjeskift fra indsatte værdier.

**1. Cloudflare.** Samme konto som StemplerInd. Account ID `6214d929377ce8f7d8c6b479a58de4b8`. StemplerInds API-token virker også her. Nyt token: My Profile › API Tokens › Create Token › Edit Cloudflare Workers. Slet Zone policy, og vælg kontoen under Account policy. Kassens adresse er `https://plejer-butik.stemplerind.workers.dev` (underdomænet `stemplerind` gælder alle Workers på kontoen).

**2. Stripe.** Plejer har sin egen Stripe-konto under samme login som Berg-Streaming (kontonavnet øverst til venstre › skift konto). Navn, logo, farve, supportmail og kontoudtogstekst `PLEJER.DK` står i kontoens indstillinger.
- Moms: kassen bruger Stripe Tax med priser inkl. moms, så betalingssiden og kvitteringen viser momsen, også af fragten. Kræver Settings › Tax: oprindelsesadresse og registrering i Danmark. Koster 0,5 % pr. betaling. Slås fra med `stripeTax: false` i `katalog.js`.
- Begrænset nøgle: Developers › API keys › Create restricted key › Write på Checkout Sessions. Sandbox først (`rk_test_`), live senere (`rk_live_`).
- Webhook: Workbench › Webhooks › Create an event destination, hændelse `checkout.session.completed`, adresse `https://plejer-butik.stemplerind.workers.dev/stripe`. Både i Sandbox og live. Kopiér `whsec_...`.
- Settings › Communication preferences › Successful payment receipt: til, så Kasper får en mail ved hver ordre. Customer emails › Successful payments: til, så kunden får kvittering.
- Stripe sender ingen kvitteringer på testbetalinger. Tryk Send receipt på betalingen for at se mailen.

**3. Shipmondo.** Samme konto og saldo som StemplerInd. Skabelonerne **Plejer GLS pakkeshop** (GLS, ShopDelivery) og **Plejer PostNord pakkeshop** (PostNord DK, Service Point, PDK_MC). Fragtaftale Shipmondo, 1 kolli 0 til 1 kg, mail og sms. Kassen vælger skabelonen ud fra navnet: Plejer og fragtfirmaet. API-brugeren fra StemplerInd kan genbruges.

**4. GitHub.** `rapsak5/plejer-web` › Settings › Secrets and variables › Actions › New repository secret:

| Name | Værdi |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Samme som StemplerInd |
| `CLOUDFLARE_ACCOUNT_ID` | `6214d929377ce8f7d8c6b479a58de4b8` |
| `STRIPE_SECRET_KEY` | `rk_test_...` fra Plejers Stripe-konto, senere `rk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` fra Plejers webhook |
| `SHIPMONDO_API_USER` | Samme som StemplerInd |
| `SHIPMONDO_API_KEY` | Samme som StemplerInd |

Kør Actions › Kasse til webshoppen › Run workflow. Den tester, udgiver kassen, lægger nøglerne i Cloudflare, henter GLS-pakkeshops ved 2300 og laver en rigtig betalingsside. Når den er grøn, svarer `https://plejer-butik.stemplerind.workers.dev` med `{"ok":true,"butik":"plejer.dk","test":true,"shipmondo":true}`.

**5. Rækkefølge.** Udgiv kassen før hjemmesiden. Kassen tager stadig imod en kurv uden pakkeshop, så betalingen virker i overgangen. Tjek bagefter på plejer.dk, at siden henter `kurv.js?v=...`, og at listen kommer for både GLS og PostNord ved 2300.

**6. Test.** Åbn `https://plejer.dk/?butik=test`, læg varer i kurven, vælg pakkeshop i dropdownen, og betal med 4242 4242 4242 4242. Tjek takkesiden og den tomme kurv, betalingen i Stripe, ordren i Shipmondo (beløb, moms 25 %, telefon, pakkeshop, skabelon) og at webhooken svarede 200.

**7. Live.** Lav `rk_live_` og en live-webhook i Plejers Stripe-konto. Ret de to secrets i GitHub, og kør workflowet. Statuslampen skal vise `test:false`.

## Bemærk

- Pakkeshops: `GET /pakkeshops?firma=gls|postnord&postnr=NNNN`. PostNords kode hos Shipmondo er `pdk`. Butikker vises før pakkebokse, højst 12. Svaret gemmes et døgn hos Cloudflare, fordi Shipmondos gratis plan har 1.000 opslag om måneden. Tæl versionen i cachenøglen op i `fragt.js`, når listens form ændres.
- Versionsnøgler: `node butik/konfigurer.mjs` sætter `?v=` på `kurv.js`, `kurv-data.js` og `stil.css` i alle sider. Testene fejler, hvis det er glemt.
- Fortrydelser går gennem FormSubmit til kasper@ai-workshop.dk.
- Stripe kører Visa/Dankort som Visa. Rene Dankort virker ikke. Ingen Klarna og ingen MobilePay.
- Bogføring én gang om måneden i e-conomic: salg inkl. moms, Stripe-gebyr og udbetaling.
