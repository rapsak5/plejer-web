// Kurven på plejer.dk. Kopieret fra StemplerInd (24. nov. 2026) med pakkeshop-valg.
// Ligger kun i browseren (localStorage) og sendes først til kassen, når kunden vil betale.
// Priserne her er kun til visning. Kassen hos Cloudflare slår de rigtige priser op selv.
// Teksterne, priserne og kassens adresse kommer fra window.KURV i kurv-data.js, som butik/konfigurer.mjs laver.
// Er butikken ikke åben (aaben: false i butik/katalog.js), virker kurven kun med ?butik=test i adressen.
// Ellers står knapperne som links til kontakt, som før.
(function () {
  var K = window.KURV; if (!K || !K.api) return;
  var t = K.t, NOEGLE = 'plejer-kurv', SHOP_NOEGLE = 'plejer-pakkeshop', TEST = 'plejer-butik-test', MAKS = 50;
  var FIRMAER = [['gls', 'GLS'], ['postnord', 'PostNord']];
  var koebt = /[?&]koeb=tak/.test(location.search);
  try { if (/[?&]butik=test/.test(location.search)) sessionStorage.setItem(TEST, '1'); } catch (e) { }
  var test = false; try { test = sessionStorage.getItem(TEST) === '1'; } catch (e) { }
  if (!K.aaben && !test && !koebt) return;

  // Butikken er åben: knapperne lægger i kurven i stedet for at gå til kontakt
  document.querySelectorAll('[data-kurv-skjul]').forEach(function (e) { e.hidden = true; });
  document.querySelectorAll('[data-kurv-vis]').forEach(function (e) { e.hidden = false; });

  function hent() { try { var v = JSON.parse(localStorage.getItem(NOEGLE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  var kurv = rens(hent());
  function gem() { try { localStorage.setItem(NOEGLE, JSON.stringify(kurv)); } catch (e) { } tegn(); }
  // Kun varer, der findes i kataloget, og hele antal
  function rens(k) { var ud = {}; Object.keys(k).forEach(function (id) { var n = Math.floor(+k[id]); if (K.varer[id] && n > 0) ud[id] = Math.min(n, MAKS); }); return ud; }
  function antal() { return Object.keys(kurv).reduce(function (s, id) { return s + kurv[id]; }, 0); }
  function sum() { return Object.keys(kurv).reduce(function (s, id) { return s + kurv[id] * K.varer[id].pris; }, 0); }
  function kr(n) { return K.fmt.foer + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, K.fmt.sep) + K.fmt.efter; }
  function el(tag, cls, tekst) { var e = document.createElement(tag); if (cls) e.className = cls; if (tekst != null) e.textContent = tekst; return e; }

  // Knappen nederst til højre og panelet
  var knap = el('button', 'kurv-knap'); knap.type = 'button'; knap.hidden = true;
  knap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>';
  var knapTal = el('span', 'kurv-tal'); knap.appendChild(el('span', 'kurv-knap-navn', t.kurv)); knap.appendChild(knapTal);
  var panel = el('dialog', 'kurv-panel'); panel.setAttribute('aria-label', t.kurvTitel);
  panel.innerHTML = '<div class="kurv-hoved"><h2></h2><button type="button" class="kurv-luk"></button></div><ul class="kurv-linjer"></ul><p class="kurv-tom daempet"></p>'
    + '<section class="kurv-shop"><h3></h3><div class="kurv-firma" role="radiogroup"></div>'
    + '<form class="kurv-soeg" novalidate><input type="text" inputmode="numeric" autocomplete="postal-code" maxlength="4" pattern="[0-9]{4}"><button type="submit" class="knap sek lille"></button></form>'
    + '<p class="kurv-shopinfo daempet" role="status" hidden></p><select class="kurv-shops" hidden></select></section>'
    + '<dl class="kurv-sum"></dl><p class="kurv-fejl" role="alert" hidden></p><button type="button" class="knap kurv-betal"></button><p class="kurv-stripe daempet"></p><p class="kurv-vilkaar"><a href="betingelser.html"></a></p>';
  panel.querySelector('h2').textContent = t.kurvTitel;
  var luk = panel.querySelector('.kurv-luk'); luk.textContent = '×'; luk.setAttribute('aria-label', t.kurvLuk);
  panel.querySelector('.kurv-tom').textContent = t.kurvTom;
  panel.querySelector('.kurv-stripe').textContent = t.kurvStripe;
  panel.querySelector('.kurv-vilkaar a').textContent = t.kurvVilkaar || '';
  var betal = panel.querySelector('.kurv-betal'), fejl = panel.querySelector('.kurv-fejl');
  document.body.appendChild(knap); document.body.appendChild(panel);

  // Pakkeshop: kunden vælger fragtfirma, skriver sit postnummer og vælger en shop i dropdownen.
  // Listen kommer fra Shipmondo gennem kassen hos Cloudflare, sorteret efter afstand.
  // Valget gemmes i browseren og sendes med til kassen, som slår shoppen op igen hos fragtfirmaet.
  var valg = (function () { try { var v = JSON.parse(localStorage.getItem(SHOP_NOEGLE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } })();
  if (!valg.firma || !FIRMAER.some(function (f) { return f[0] === valg.firma; })) valg.firma = 'gls';
  function gemValg() { try { localStorage.setItem(SHOP_NOEGLE, JSON.stringify(valg)); } catch (e) { } }
  var shopDel = panel.querySelector('.kurv-shop'), firmaDel = panel.querySelector('.kurv-firma'), soeg = panel.querySelector('.kurv-soeg');
  var postnr = soeg.querySelector('input'), findKnap = soeg.querySelector('button'), info = panel.querySelector('.kurv-shopinfo');
  var vaelger = panel.querySelector('.kurv-shops'), liste = [];
  shopDel.querySelector('h3').textContent = t.kurvLevering;
  postnr.setAttribute('aria-label', t.kurvPostnr); postnr.placeholder = t.kurvPostnr; postnr.value = valg.soeg || '';
  findKnap.textContent = t.kurvFind;
  vaelger.setAttribute('aria-label', t.kurvVaelgShop);
  FIRMAER.forEach(function (f) {
    var lab = el('label', 'kurv-firmavalg'), r = el('input'); r.type = 'radio'; r.name = 'kurv-firma'; r.value = f[0]; r.checked = valg.firma === f[0];
    r.onchange = function () { valg.firma = f[0]; valg.shop = null; gemValg(); vaelger.hidden = true; besked(''); if (/^\d{4}$/.test(postnr.value)) find(); };
    lab.appendChild(r); lab.appendChild(el('span', null, f[1])); firmaDel.appendChild(lab);
  });
  function shopTekst(p) { return p.navn + ', ' + p.adresse + ', ' + p.postnr + ' ' + p.by; }
  function besked(tekst) { info.textContent = tekst; info.hidden = !tekst; }
  // Dropdownen: første linje beder kunden vælge, derefter shops fra Shipmondo, nærmeste først
  function fyld(shops, valgtId) {
    liste = shops; vaelger.textContent = '';
    var forst = el('option', null, t.kurvVaelgShop); forst.value = ''; forst.disabled = true; vaelger.appendChild(forst);
    shops.forEach(function (p) { var o = el('option', null, shopTekst(p)); o.value = p.id; vaelger.appendChild(o); });
    vaelger.value = valgtId && shops.some(function (p) { return p.id === valgtId; }) ? valgtId : '';
    vaelger.hidden = false;
  }
  vaelger.onchange = function () {
    var p = liste.filter(function (x) { return x.id === vaelger.value; })[0];
    valg.shop = p || null; valg.soeg = postnr.value; gemValg(); if (p) fejl.hidden = true;
  };
  function find() {
    var nr = postnr.value.replace(/\s/g, '');
    if (!/^\d{4}$/.test(nr)) { besked(t.kurvPostnrFejl); postnr.focus(); return; }
    var foer = valg.shop && valg.soeg === nr ? valg.shop.id : null;
    besked(t.kurvVent); vaelger.hidden = true; findKnap.disabled = true;
    fetch(K.api + '/pakkeshops?firma=' + valg.firma + '&postnr=' + nr)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.fejl || r.status); return d; }); })
      .then(function (d) {
        findKnap.disabled = false;
        if (!d.pakkeshops || !d.pakkeshops.length) { valg.shop = null; gemValg(); return besked(t.kurvIngen); }
        besked('');
        if (!foer) { valg.shop = null; valg.soeg = nr; gemValg(); }
        fyld(d.pakkeshops, foer);
      })
      .catch(function (e) { findKnap.disabled = false; besked(String(e.message) === 'postnr' ? t.kurvPostnrFejl : t.kurvShopFejl); });
  }
  soeg.onsubmit = function (e) { e.preventDefault(); find(); };
  // Fire cifre er nok: listen hentes, så snart postnummeret er skrevet
  postnr.oninput = function () { if (/^\d{4}$/.test(postnr.value.replace(/\s/g, ''))) find(); };
  // Kunden har valgt før: vis den gemte shop i dropdownen
  if (valg.shop && valg.shop.id) fyld([valg.shop], valg.shop.id);

  function tegn() {
    var n = antal(); knapTal.textContent = n; knap.hidden = n === 0;
    knap.setAttribute('aria-label', t.kurv + ': ' + n);
    var ul = panel.querySelector('.kurv-linjer'); ul.textContent = '';
    Object.keys(kurv).forEach(function (id) {
      var v = K.varer[id], li = el('li');
      li.appendChild(el('span', 'kurv-navn', v.navn));
      var styr = el('span', 'kurv-styr');
      var minus = el('button', 'kurv-pm', '−'); minus.type = 'button'; minus.setAttribute('aria-label', t.kurvFaerre + ': ' + v.navn);
      var plus = el('button', 'kurv-pm', '+'); plus.type = 'button'; plus.setAttribute('aria-label', t.kurvFlere + ': ' + v.navn);
      minus.onclick = function () { kurv[id]--; if (kurv[id] < 1) delete kurv[id]; gem(); };
      plus.onclick = function () { kurv[id] = Math.min(MAKS, kurv[id] + 1); gem(); };
      styr.appendChild(minus); styr.appendChild(el('span', 'kurv-antal', kurv[id])); styr.appendChild(plus);
      li.appendChild(styr); li.appendChild(el('span', 'kurv-pris', kr(kurv[id] * v.pris)));
      var fjern = el('button', 'kurv-fjern tekstknap', t.kurvFjern); fjern.type = 'button';
      fjern.onclick = function () { delete kurv[id]; gem(); };
      li.appendChild(fjern); ul.appendChild(li);
    });
    panel.querySelector('.kurv-tom').hidden = n > 0;
    var dl = panel.querySelector('.kurv-sum'); dl.hidden = n === 0; betal.hidden = n === 0; shopDel.hidden = n === 0;
    dl.innerHTML = '<dt></dt><dd></dd><dt class="ialt"></dt><dd class="ialt"></dd>';
    var d = dl.children; d[0].textContent = t.kurvFragt; d[1].textContent = kr(K.fragt); d[2].textContent = t.kurvIalt; d[3].textContent = kr(sum() + K.fragt);
    betal.textContent = t.kurvBetal; betal.disabled = false;
  }

  function aabn() { fejl.hidden = true; tegn(); if (panel.showModal) panel.showModal(); else panel.setAttribute('open', ''); }
  function lukPanel() { if (panel.close) panel.close(); else panel.removeAttribute('open'); }
  knap.onclick = aabn; luk.onclick = lukPanel;
  panel.addEventListener('click', function (e) { if (e.target === panel) lukPanel(); });

  document.querySelectorAll('[data-kurv]').forEach(function (b) {
    b.textContent = t.kurvLaeg; b.removeAttribute('href'); b.setAttribute('role', 'button'); b.tabIndex = 0;
    var navn = b.textContent;
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var id = b.getAttribute('data-kurv'); if (!K.varer[id]) return;
      kurv[id] = Math.min(MAKS, (kurv[id] || 0) + 1); gem();
      b.textContent = t.kurvLagt; b.classList.add('lagt');
      setTimeout(function () { b.textContent = navn; b.classList.remove('lagt'); }, 1600);
      knap.classList.remove('puls'); void knap.offsetWidth; knap.classList.add('puls');
    });
  });

  betal.onclick = function () {
    var varer = Object.keys(kurv).map(function (id) { return { id: id, antal: kurv[id] }; });
    if (!varer.length) return;
    if (!valg.shop || !valg.shop.id) { fejl.textContent = t.kurvVaelg; fejl.hidden = false; (vaelger.hidden ? postnr : vaelger).focus(); return; }
    betal.disabled = true; betal.textContent = t.kurvVent; fejl.hidden = true;
    fetch(K.api + '/kasse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ varer: varer, sprog: K.sprog, sti: location.pathname, pakkeshop: { firma: valg.firma, postnr: valg.soeg, id: valg.shop.id } }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.url) throw new Error(d.fejl || r.status); return d; }); })
      .then(function (d) { location.href = d.url; })
      .catch(function (e) {
        betal.disabled = false; betal.textContent = t.kurvBetal; fejl.hidden = false;
        // Pakkeshoppen findes ikke længere hos fragtfirmaet: vælg igen
        if (String(e.message) === 'pakkeshop') { valg.shop = null; gemValg(); vaelger.value = ''; fejl.textContent = t.kurvVaelg; return; }
        fejl.textContent = t.kurvFejl.replace('{mail}', K.mail);
      });
  };

  // Tilbage fra Stripe efter betaling: tøm kurven og sig tak
  if (koebt) {
    kurv = {}; gem();
    var tak = el('p', 'kurv-tak', t.kurvTak); tak.setAttribute('role', 'status');
    var pakker = document.getElementById('pakker'); (pakker ? pakker.querySelector('.ramme') : document.body).prepend(tak);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }
  }
  tegn();
})();
