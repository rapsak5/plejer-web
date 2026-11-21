# Kassen til Plejers webshop

Samme opbygning som StemplerInd. Kurven ligger i kundens browser på plejer.dk. Når kunden trykker Gå til betaling, sender kurven varer og antal til kassen her. Kassen er en Cloudflare Worker. Den slår priserne op i `katalog.js` og sender kunden videre til Stripes betalingsside. Når kunden har betalt, opretter kassen ordren i Shipmondo.

Ingen faste udgifter: Cloudflares gratis plan, Shipmondos gratis plan og Stripes gebyr pr. betaling.

| Fil | Hvad |
| --- | --- |
| `katalog.js` | Priser, varer, fragt, kassens adresse og om butikken er åben. Den eneste kilde til priser |
| `konfigurer.mjs` | Laver `../kurv-data.js` til hjemmesiden ud fra kataloget |
| `worker.js` | Kassen. Tjekker kurven og laver betalingen hos Stripe |
| `fragt.js` | Betalte ordrer fra Stripe til Shipmondo |
| `wrangler.toml` | Navnet på kassen hos Cloudflare: `plejer-butik` |
| `../kurv.js` | Kurven på hjemmesiden |
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

Kasper taster selv alle nøgler. De lægges som hemmeligheder i GitHub og aldrig i koden. Gem dem i adgangskodemanageren, for GitHub viser dem ikke igen.

**1. Cloudflare.** Samme konto som StemplerInd. Account ID `6214d929377ce8f7d8c6b479a58de4b8`. StemplerInds API-token virker også her. Nyt token: My Profile › API Tokens › Create Token › Edit Cloudflare Workers. Slet Zone policy, og vælg kontoen under Account policy.

**2. Stripe.** Samme Stripe-konto som StemplerInd. Ingen ny konto. Hver betaling har `butik: plejer.dk` i metadata, og kassen sender kun sine egne betalinger videre til Shipmondo. På kontoudtoget står kontoens navn efterfulgt af `PLEJER` (`kontoudtog` i `katalog.js`).
- Den begrænsede nøgle fra StemplerInd (kun Write på Checkout Sessions) kan genbruges som `STRIPE_SECRET_KEY`.
- Ny webhook til Plejer: Developers › Webhooks › Add destination, hændelse `checkout.session.completed`, adresse `https://plejer-butik.stemplerind.workers.dev/stripe`. Kopiér `whsec_...`. StemplerInds webhook får også Plejers betalinger, men springer dem over, fordi varerne er ukendte i StemplerInds katalog.
- Betalingssiden viser kontoens navn og logo, ikke Plejers.

**3. Shipmondo.** Samme konto som StemplerInd. Opret forsendelsesskabelonen **Plejer GLS pakkeshop**: GLS Denmark, ShopDelivery, fragtaftale Shipmondo, 0 til 1 kg, e-mailadvisering. Kassen finder den, fordi navnet indeholder Plejer. API-brugeren fra StemplerInd kan genbruges.

**4. GitHub.** `rapsak5/plejer-web` › Settings › Secrets and variables › Actions › New repository secret:

| Name | Værdi |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Samme som StemplerInd |
| `CLOUDFLARE_ACCOUNT_ID` | `6214d929377ce8f7d8c6b479a58de4b8` |
| `STRIPE_SECRET_KEY` | Samme `rk_test_...` som StemplerInd |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` fra Plejers nye webhook |
| `SHIPMONDO_API_USER` | Samme som StemplerInd |
| `SHIPMONDO_API_KEY` | Samme som StemplerInd |

Kør Actions › Kasse til webshoppen › Run workflow. Når den er grøn, svarer `https://plejer-butik.stemplerind.workers.dev` med `{"ok":true,"butik":"plejer.dk","test":true,"shipmondo":true}`.

**5. Test.** Åbn `https://plejer.dk/?butik=test`, læg varer i kurven, og betal med testkortet 4242 4242 4242 4242. Tjek tak-beskeden, den tomme kurv, kvitteringen på mail, betalingen i Stripe Sandbox og ordren i Shipmondo. Læg også et enkelt mærke i kurven, og se, at Stripe spørger efter hvilke, og at svaret står på ordren i Shipmondo.

**6. Live.** Brug StemplerInds live-nøgle (`rk_live_`) og lav Plejers webhook uden Sandbox. Ret `STRIPE_SECRET_KEY` og `STRIPE_WEBHOOK_SECRET` i GitHub, og kør workflowet.

## Bemærk

- Fortrydelser går gennem FormSubmit til kasper@ai-workshop.dk. Første gang sender FormSubmit en mail, der skal aktiveres.
- Stripe kører Visa/Dankort som Visa. Rene Dankort virker ikke.
- Bogføring én gang om måneden i e-conomic: salg inkl. moms, Stripe-gebyr og udbetaling.
