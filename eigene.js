/* Eigene Bohrungen: Schichtenverzeichnis von der Geländeoberkante abwärts selbst erfassen (Schritte von 1 m, aufklappbare Bodenansprache),
 * lokal im Gerät speichern, in der Karte als eigene Kategorie zeigen, exportieren und sichern.
 * Daten bleiben im Gerät (localStorage). Optional Abgleich über ein privates GitHub-Repository (Datei eigene-bohrungen.json),
 * damit alle Geräte dieselben Bohrungen haben. Je Bohrung gilt die neuere Änderung, Löschungen werden als Vermerk weitergegeben.
 * Regelmäßig mit "Alle sichern" in eine Datei sichern, weil iOS Web-Daten löschen kann. */
(function (global) {
  var KEY = "schichten.eigene.v1", TKEY = "schichten.eigene.geloescht.v1", SKEY = "schichten.sync.v1", SYNCFILE = "eigene-bohrungen.json", SHAREFILE = "geteilte-bohrungen.json";
  var ARTEN = [
    { g: "Häufig", items: [["Oberboden", "Auffüllung / Boden", "OB – Oberboden"], ["Feinsand", "Feinsand", "FS – Feinsand"], ["Mittelsand", "Mittelsand", "MS – Mittelsand"], ["Grobsand", "Grobsand", "GS – Grobsand"], ["Lehm", "Geschiebemergel / Lehm", "Lehm"], ["Geschiebemergel", "Geschiebemergel / Lehm", "Geschiebemergel"]] },
    { g: "Weitere Sande und Kiese", items: [["Sand", "Sand (o. n. A.)", "Sand (ohne nähere Angabe)"], ["Feinkies", "Kies", "Feinkies"], ["Mittelkies", "Kies", "Mittelkies"], ["Grobkies", "Kies", "Grobkies"], ["Kies", "Kies", "Kies"]] },
    { g: "Bindig", items: [["Schluff", "Schluff", "Schluff"], ["Ton", "Ton", "Ton"], ["Geschiebelehm", "Geschiebemergel / Lehm", "Geschiebelehm"], ["Mergel", "Geschiebemergel / Lehm", "Mergel"]] },
    { g: "Organisch und Sonstiges", items: [["Torf", "Torf / Mudde", "Torf"], ["Mudde", "Torf / Mudde", "Mudde"], ["Humus", "Torf / Mudde", "Humus"], ["Auffüllung", "Auffüllung / Boden", "Auffüllung"], ["Braunkohle", "Braunkohle", "Braunkohle"], ["Fels", "Festgestein", "Fels"], ["Sonstiges", "Sonstiges", "Sonstiges"]] }
  ];
  var CATOF = {};
  ARTEN.forEach(function (g) { g.items.forEach(function (it) { CATOF[it[0]] = it[1]; }); });
  CATOF["Mutterboden"] = "Auffüllung / Boden";
  var GWLOPT = [["", "ohne Grundwasserleiter"], ["beginn", "GWL Beginn (Oberkante)"], ["ende", "GWL Ende (Unterkante)"], ["beides", "GWL Beginn und Ende"]];
  var GWLTXT = { beginn: "GWL Beginn", ende: "GWL Ende", beides: "GWL Beginn und Ende" };
  var BEIMENGUNG = ["", "schluffig", "tonig", "sandig", "kiesig", "humos", "steinig"];

  var map, panel, markers, esc, fmtN, onChange = function () {}, draft = null, picking = false, all = [], shared = [], tomb = {}, syncTimer = null, syncBusy = false, syncAgain = false, syncMsg = "";

  function load() {
    try { all = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { all = []; }
    try { tomb = JSON.parse(localStorage.getItem(TKEY) || "{}") || {}; } catch (e) { tomb = {}; }
  }
  function persistRaw() {
    try { localStorage.setItem(KEY, JSON.stringify(all)); localStorage.setItem(TKEY, JSON.stringify(tomb)); return true; }
    catch (e) { alert("Speichern im Gerät ist nicht möglich (Speicher voll oder gesperrt). Bitte die Bohrung über „Alle sichern“ als Datei sichern."); return false; }
  }
  // Änderung des Nutzers: im Gerät speichern und danach (verzögert) mit GitHub abgleichen
  function persist() { var ok = persistRaw(); if (ok) scheduleSync(1500); return ok; }
  function stamp(b) { return b.geaendert || b.erstellt || 0; }
  function uid() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function textOf(l) { return l.art + (l.bei ? ", " + l.bei : ""); }
  function depthOf(b) { return b.layers.length ? b.layers[b.layers.length - 1].bis : 0; }

  // Schichten als [von, bis, Text, Kategorie] für Säule und Schätzung
  // Sand und Kies gelten nur dann als Grundwasserleiter (rot), wenn der Nutzer ihn aktiv markiert hat; sonst gedämpfte Farbe
  function catFor(l, ivs) {
    var cat = CATOF[l.art] || "Sonstiges";
    if (!PROFIL.isAquifer(cat)) return cat;
    var mid = (l.von + l.bis) / 2;
    var inG = ivs.some(function (p) { return mid >= p[0] && mid <= p[1]; });
    return inG ? cat : (cat === "Kies" ? "Kies (ohne GWL)" : "Sand (ohne GWL)");
  }
  function layersOf(b) {
    var prev = 0, ivs = gwlList(b.layers);
    return b.layers.filter(function (l) { return l.art; }).map(function (l) {
      var r = [l.von != null ? l.von : prev, l.bis, textOf(l), catFor(l, ivs)];
      prev = l.bis; return r;
    });
  }
  // Wie ein Eintrag der Landesdaten, damit die eigene Bohrung in Liste und Schätzung mitläuft
  function asBohrungen() {
    return all.filter(function (b) { return b.layers.length && b.layers.every(function (l) { return l.art; }); }).map(function (b) {
      return { i: "eigen-" + b.id, n: b.name + " (eigene)", a: b.lat, o: b.lon, t: depthOf(b), h: b.hoehe || 0, k: "eigen", l: layersOf(b), p: 0, eigen: 1, eid: b.id };
    }).concat(sharedOthers().filter(function (b) { return b.layers.length && b.layers.every(function (l) { return l.art; }); }).map(function (b) {
      return { i: "geteilt-" + b.id, n: b.name + " (geteilt)", a: b.lat, o: b.lon, t: depthOf(b), h: b.hoehe || 0, k: "eigen", l: layersOf(b), p: 0, eigen: 1, geteilt: 1, eid: b.id };
    }));
  }
  // Geteilte Bohrungen, die nicht ohnehin zu den eigenen dieses Geräts gehören
  function sharedOthers() { return shared.filter(function (b) { return !all.some(function (x) { return x.id === b.id; }); }); }
  function loadShared() {
    return fetch(SHAREFILE + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var arr = d && d.bohrungen ? d.bohrungen.filter(function (b) { return b && b.id && b.layers && b.lat != null && b.lon != null; }) : [];
      if (JSON.stringify(arr) !== JSON.stringify(shared)) { shared = arr; drawMarkers(); onChange(); }
    }).catch(function () {});
  }

  /* ---------- Karte ---------- */
  function drawMarkers() {
    markers.clearLayers();
    all.forEach(function (b) {
      var icon = L.divIcon({ className: "own-marker", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker([b.lat, b.lon], { icon: icon, title: b.name }).addTo(markers).on("click", function () { show(b.id); });
    });
    sharedOthers().forEach(function (b) {
      var icon = L.divIcon({ className: "own-marker shared-marker", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker([b.lat, b.lon], { icon: icon, title: b.name + " (geteilt)" }).addTo(markers).on("click", function () { show(b.id); });
    });
  }

  /* ---------- Hilfen für die Oberfläche ---------- */
  function artSelect(sel) {
    var h = '<select class="oart" aria-label="Bodenart"><option value="">Bodenart wählen …</option>';
    ARTEN.forEach(function (g) {
      h += '<optgroup label="' + g.g + '">';
      g.items.forEach(function (it) { h += '<option value="' + it[0] + '"' + (sel === it[0] ? " selected" : "") + ">" + it[2] + "</option>"; });
      h += "</optgroup>";
    });
    return h + "</select>";
  }
  function beiSelect(sel) {
    return '<select class="obei" aria-label="Beimengung">' + BEIMENGUNG.map(function (b) { return '<option value="' + b + '"' + (sel === b ? " selected" : "") + ">" + (b || "ohne Beimengung") + "</option>"; }).join("") + "</select>";
  }
  function gwlSelect(sel) {
    return '<select class="ogwl" aria-label="Grundwasserleiter">' + GWLOPT.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>";
  }
  function relink() { var p = 0; draft.layers.forEach(function (l) { l.von = p; if (l.bis <= l.von) l.bis = round1(l.von + 1); p = l.bis; }); }
  // Grundwasserleiter aus den Markierungen: Beginn = Oberkante der Schicht, Ende = Unterkante
  function gwlList(layers) {
    var res = [], start = null;
    layers.forEach(function (l) {
      var g = l.gwl || "";
      if ((g === "beginn" || g === "beides") && start == null) start = l.von;
      if ((g === "ende" || g === "beides") && start != null) { res.push([start, l.bis]); start = null; }
    });
    if (start != null) res.push([start, layers[layers.length - 1].bis]);
    return res;
  }
  function gwlText(layers) {
    return gwlList(layers).map(function (p) { return fmtN(p[0]) + " – " + fmtN(p[1]) + " m"; }).join("; ");
  }

  /* ---------- Eingabemaske ---------- */
  function newDraft() {
    return { id: null, name: "", datum: today(), lat: null, lon: null, hoehe: "", teilen: true, layers: [{ von: 0, bis: 1, art: "", bei: "", bem: "", gwl: "" }] };
  }
  function open(d) {
    draft = d || newDraft(); picking = false; renderForm(); scrollToPanel();
  }
  function scrollToPanel() { panel.scrollIntoView({ block: "start" }); }

  function renderForm() {
    relink();
    var h = '<h2>' + (draft.id ? "Bohrung bearbeiten" : "Neue Bohrung") + '</h2>' +
      '<div class="own-grid"><label>Name<input type="text" id="oName" value="' + esc(draft.name) + '" placeholder="z. B. B1 Grundstück Müller"></label>' +
      '<label>Datum<input type="date" id="oDatum" value="' + esc(draft.datum) + '"></label>' +
      '<label>Geländehöhe in m NHN (optional)<input type="number" id="oHoehe" step="0.1" value="' + esc(String(draft.hoehe)) + '"></label></div>' +
      '<label class="own-share"><input type="checkbox" id="oTeilen"' + (draft.teilen !== false ? " checked" : "") + '> Öffentlich teilen (für alle sichtbar, die den Link öffnen; wirkt nur bei verbundenem GitHub-Abgleich)</label>' +
      '<p class="own-pos" id="oPos"></p><div class="tools"><button type="button" class="ghost" id="oGps">Standort per GPS</button>' +
      '<button type="button" class="ghost" id="oPick">Punkt in Karte setzen</button><button type="button" class="ghost" id="oCenter">Kartenmitte nehmen</button></div>' +
      '<h2>Schichten ab Geländeoberkante</h2><p class="hint">Jede Zeile ist standardmäßig 1 m. Bei „bis“ kannst du jede Tiefe eintragen, die letzte Zeile gibt die Endteufe.</p><div id="oRows"></div>' +
      '<div class="tools"><button type="button" class="ghost" id="oAdd">+ weitere 1 m</button><button type="button" class="ghost" id="oDel">Letzte Zeile löschen</button></div>' +
      '<div id="oPreview"></div>' +
      '<div class="tools"><button type="button" id="oSave">Bohrung speichern</button><button type="button" class="ghost" id="oCancel">Abbrechen</button></div>';
    panel.innerHTML = h;
    renderRows(); updatePos();
    panel.querySelector("#oName").addEventListener("input", function (e) { draft.name = e.target.value; });
    panel.querySelector("#oDatum").addEventListener("input", function (e) { draft.datum = e.target.value; });
    panel.querySelector("#oHoehe").addEventListener("input", function (e) { draft.hoehe = e.target.value; });
    panel.querySelector("#oTeilen").addEventListener("change", function (e) { draft.teilen = e.target.checked; });
    panel.querySelector("#oGps").addEventListener("click", gps);
    panel.querySelector("#oPick").addEventListener("click", function () { picking = true; updatePos("Tippe jetzt in die Karte, um den Bohrpunkt zu setzen."); map.getContainer().scrollIntoView({ block: "start" }); });
    panel.querySelector("#oCenter").addEventListener("click", function () { var c = map.getCenter(); setPos(c.lat, c.lng); });
    panel.querySelector("#oAdd").addEventListener("click", function () { var last = draft.layers[draft.layers.length - 1]; draft.layers.push({ von: last.bis, bis: round1(last.bis + 1), art: "", bei: "", bem: "", gwl: "" }); renderRows(); });
    panel.querySelector("#oDel").addEventListener("click", function () { if (draft.layers.length > 1) { draft.layers.pop(); renderRows(); } });
    panel.querySelector("#oSave").addEventListener("click", save);
    panel.querySelector("#oCancel").addEventListener("click", function () { draft = null; picking = false; panel.innerHTML = ""; });
  }

  function renderRows() {
    relink();
    var rows = panel.querySelector("#oRows"), h = "";
    draft.layers.forEach(function (l, i) {
      h += '<div class="orow" data-i="' + i + '"><div class="od">' + fmtN(l.von) + ' – <input type="number" class="obis" step="0.1" min="' + (l.von + 0.1) + '" value="' + l.bis + '" aria-label="bis Meter"> m</div>' +
        artSelect(l.art) + beiSelect(l.bei) + gwlSelect(l.gwl || "") + '<input type="text" class="obem" placeholder="Bemerkung, Farbe, Feuchte …" value="' + esc(l.bem || "") + '"></div>';
    });
    rows.innerHTML = h;
    rows.querySelectorAll(".orow").forEach(function (row) {
      var i = parseInt(row.dataset.i, 10), l = draft.layers[i];
      row.querySelector(".oart").addEventListener("change", function (e) { l.art = e.target.value; preview(); });
      row.querySelector(".ogwl").addEventListener("change", function (e) { l.gwl = e.target.value; preview(); });
      row.querySelector(".obei").addEventListener("change", function (e) { l.bei = e.target.value; preview(); });
      row.querySelector(".obem").addEventListener("input", function (e) { l.bem = e.target.value; });
      row.querySelector(".obis").addEventListener("change", function (e) {
        var v = parseFloat(String(e.target.value).replace(",", "."));
        l.bis = isNaN(v) || v <= l.von ? round1(l.von + 1) : round1(v);
        for (var j = i + 1; j < draft.layers.length; j++) if (draft.layers[j].bis <= l.bis) draft.layers[j].bis = round1(l.bis + 1);
        renderRows();
      });
    });
    preview();
  }

  function preview() {
    var el = panel.querySelector("#oPreview");
    if (!el) return;
    var ivsP = gwlList(draft.layers);
    var layers = draft.layers.map(function (l) { return [l.von, l.bis, l.art ? textOf(l) : "noch nicht angesprochen", l.art ? catFor(l, ivsP) : "Sonstiges"]; });
    el.innerHTML = '<div class="gok">▼ 0 m = Geländeoberkante</div>' + PROFIL.drawColumn(layers) + '<div class="gok">▲ Endteufe ' + fmtN(depthOf(draft)) + ' m</div>' + (gwlList(draft.layers).length ? '<p class="meta">Grundwasserleiter: ' + gwlText(draft.layers) + '</p>' : '');
  }

  function updatePos(msg) {
    var el = panel.querySelector("#oPos");
    if (!el) return;
    el.textContent = msg || (draft.lat == null ? "Standort: noch nicht gesetzt." : "Standort: " + draft.lat.toFixed(5) + " N, " + draft.lon.toFixed(5) + " O");
  }
  function setPos(lat, lon) { draft.lat = lat; draft.lon = lon; picking = false; updatePos(); }
  function gps() {
    if (!navigator.geolocation) { updatePos("Standortbestimmung ist in diesem Browser nicht verfügbar."); return; }
    updatePos("Suche Standort …");
    navigator.geolocation.getCurrentPosition(function (p) { setPos(p.coords.latitude, p.coords.longitude); map.setView([p.coords.latitude, p.coords.longitude], 17, { animate: false }); },
      function () { updatePos("Standort nicht ermittelbar (Freigabe verweigert oder kein Signal). Setze den Punkt in der Karte."); }, { enableHighAccuracy: true, timeout: 15000 });
  }

  function save() {
    var msg = [];
    if (draft.lat == null) msg.push("den Standort setzen");
    if (draft.layers.some(function (l) { return !l.art; })) msg.push("bei jeder Schicht eine Bodenart wählen");
    if (msg.length) { alert("Bitte noch " + msg.join(" und ") + "."); return; }
    var n = all.length + 1;
    var rec = { id: draft.id || uid(), name: (draft.name || "").trim() || "Eigene Bohrung " + n, datum: draft.datum || today(), lat: draft.lat, lon: draft.lon,
                hoehe: draft.hoehe === "" ? null : parseFloat(String(draft.hoehe).replace(",", ".")),
                layers: draft.layers.map(function (l) { return { von: l.von, bis: l.bis, art: l.art, bei: l.bei, bem: l.bem || "", gwl: l.gwl || "" }; }), erstellt: Date.now(), geaendert: Date.now(), teilen: draft.teilen !== false };
    var idx = all.findIndex(function (b) { return b.id === rec.id; });
    if (idx >= 0 && all[idx].erstellt) rec.erstellt = all[idx].erstellt;
    delete tomb[rec.id];
    if (idx >= 0) all[idx] = rec; else all.push(rec);
    if (!persist()) return;
    draft = null; drawMarkers(); onChange(); show(rec.id);
  }

  /* ---------- Ansicht, Liste, Export ---------- */
  function show(id) {
    var b = all.find(function (x) { return x.id === id; }), ro = false;
    if (!b) { b = shared.find(function (x) { return x.id === id; }); ro = true; }
    if (!b) return;
    var lay = layersOf(b), gwlIvs = gwlList(b.layers);
    var h = '<h2>' + esc(b.name) + '</h2><table class="facts"><tr><td>Datum</td><td>' + esc(b.datum) + '</td></tr><tr><td>Standort</td><td>' + b.lat.toFixed(5) + " N, " + b.lon.toFixed(5) + ' O</td></tr>' +
      '<tr><td>Geländehöhe</td><td>' + (b.hoehe != null ? fmtN(b.hoehe) + " m NHN" : "keine Angabe") + '</td></tr><tr><td>Endteufe</td><td>' + fmtN(depthOf(b)) + ' m</td></tr><tr><td>Grundwasserleiter (GWL)</td><td>' + (gwlText(b.layers) || "nicht markiert") + '</td></tr></table>' +
      '<div class="legend"><span><span class="sw" style="background:#e53935"></span>rot = von dir als Grundwasserleiter markiert</span></div>' +
      '<div class="gok">▼ 0 m = Geländeoberkante</div>' + PROFIL.drawColumn(lay) + '<div class="gok">▲ Endteufe ' + fmtN(depthOf(b)) + ' m</div>' +
      '<table class="layers"><tr><td class="meta">Tiefe (m)</td><td class="meta">Bodenart</td><td class="meta">Bemerkung</td></tr>';
    b.layers.forEach(function (l) {
      var aq = gwlIvs.some(function (p) { return (l.von + l.bis) / 2 >= p[0] && (l.von + l.bis) / 2 <= p[1]; });
      h += '<tr class="' + (aq ? "gwl" : "") + '"><td>' + fmtN(l.von) + " – " + fmtN(l.bis) + '</td><td>' + esc(textOf(l)) + (aq ? " (Grundwasserleiter)" : "") + (l.gwl ? " · " + GWLTXT[l.gwl] : "") + '</td><td>' + esc(l.bem || "") + '</td></tr>';
    });
    h += '</table>' + (ro ? '<p class="hint">Geteilte Bohrung, nur lesbar.</p>' : "") + '<div class="tools">' + (ro ? "" : '<button type="button" class="ghost" id="oEdit">Bearbeiten</button>') + '<button type="button" class="ghost" id="oCsv">Als CSV</button>' +
      '<button type="button" class="ghost" id="oMap">In der Karte zeigen</button>' + (ro ? "" : '<button type="button" class="ghost" id="oRemove">Löschen</button>') + '<button type="button" class="ghost" id="oList">Meine Bohrungen</button></div>';
    panel.innerHTML = h; scrollToPanel();
    if (!ro) panel.querySelector("#oEdit").addEventListener("click", function () {
      open({ id: b.id, name: b.name, datum: b.datum, lat: b.lat, lon: b.lon, hoehe: b.hoehe == null ? "" : b.hoehe, teilen: b.teilen === true, layers: b.layers.map(function (l) { return { von: l.von, bis: l.bis, art: l.art, bei: l.bei || "", bem: l.bem || "", gwl: l.gwl || "" }; }) });
    });
    panel.querySelector("#oCsv").addEventListener("click", function () { download(b.name.replace(/[^\wäöüÄÖÜß-]+/g, "_") + ".csv", csv(b), "text/csv"); });
    panel.querySelector("#oMap").addEventListener("click", function () { map.setView([b.lat, b.lon], 17, { animate: false }); map.getContainer().scrollIntoView({ block: "start" }); });
    if (!ro) panel.querySelector("#oRemove").addEventListener("click", function () {
      if (confirm("Bohrung „" + b.name + "“ wirklich löschen? Das lässt sich nicht rückgängig machen.")) { all = all.filter(function (x) { return x.id !== b.id; }); tomb[b.id] = Date.now(); persist(); drawMarkers(); onChange(); list(); }
    });
    panel.querySelector("#oList").addEventListener("click", list);
  }

  function csv(b) {
    var rows = ["Name;" + b.name, "Datum;" + b.datum, "Breite;" + b.lat, "Länge;" + b.lon, "Geländehöhe_m_NHN;" + (b.hoehe == null ? "" : b.hoehe), "", "Grundwasserleiter_m;" + (gwlText(b.layers) || ""), "", "von_m;bis_m;Bodenart;Beimengung;GWL;Bemerkung"];
    b.layers.forEach(function (l) { rows.push([l.von, l.bis, l.art, l.bei || "", l.gwl ? GWLTXT[l.gwl] : "", (l.bem || "").replace(/;/g, ",")].join(";")); });
    return "﻿" + rows.join("\r\n");
  }
  function download(name, text, type) {
    var a = document.createElement("a"), blob = new Blob([text], { type: type + ";charset=utf-8" });
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- Abgleich mit GitHub (privates Repository, Datei eigene-bohrungen.json) ---------- */
  function syncCfg() { try { var c = JSON.parse(localStorage.getItem(SKEY) || "null"); return c && c.repo && c.token ? c : null; } catch (e) { return null; } }
  function b64enc(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(bin); }
  function b64dec(b64) { var bin = atob(b64.replace(/\s/g, "")), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function ghFetch(cfg, method, body, repo, path) {
    var url = "https://api.github.com/repos/" + (repo || cfg.repo) + "/contents/" + (path || SYNCFILE);
    return fetch(method === "GET" ? url + "?t=" + Date.now() : url, {
      method: method, cache: "no-store",
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + cfg.token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function setSyncMsg(m) { syncMsg = m; var el = panel && panel.querySelector("#oSyncMsg"); if (el) el.textContent = m; }
  function fehlerText(status) {
    if (status === 401) return "Token ungültig oder abgelaufen.";
    if (status === 403) return "Zugriff verweigert (Token braucht Contents: Read and write für dieses Repository).";
    if (status === 404) return "Repository nicht gefunden (Name prüfen, Token muss dieses Repository sehen dürfen).";
    return "GitHub-Fehler " + status + ".";
  }
  // Je Bohrung zählt die neuere Änderung; ein Löschvermerk gewinnt, wenn er neuer ist als die Bohrung
  function merge(remote) {
    var rb = (remote && remote.bohrungen) || [], rt = (remote && remote.geloescht) || {}, byId = {}, ts = {}, changed = false, id;
    all.forEach(function (b) { byId[b.id] = b; });
    rb.forEach(function (b) { if (b && b.id && b.layers && (!byId[b.id] || stamp(b) > stamp(byId[b.id]))) byId[b.id] = b; });
    for (id in rt) if (!(ts[id] >= rt[id])) ts[id] = rt[id];
    for (id in tomb) if (!(ts[id] >= tomb[id])) ts[id] = tomb[id];
    for (id in ts) { if (byId[id] && ts[id] >= stamp(byId[id])) delete byId[id]; else if (byId[id]) delete ts[id]; }
    var merged = Object.keys(byId).map(function (k) { return byId[k]; });
    var a = JSON.stringify(all.map(function (b) { return b.id + ":" + stamp(b); }).sort()), c = JSON.stringify(merged.map(function (b) { return b.id + ":" + stamp(b); }).sort());
    if (a !== c || JSON.stringify(tomb) !== JSON.stringify(ts)) changed = true;
    all = merged; tomb = ts;
    var rIds = JSON.stringify(rb.map(function (b) { return b.id + ":" + stamp(b); }).sort()), rTomb = JSON.stringify(rt);
    return { changed: changed, remoteDiffers: rIds !== c || rTomb !== JSON.stringify(ts) };
  }
  // Bohrungen mit Haken "Öffentlich teilen" in die öffentliche Datei der App schreiben (nur bei Änderung)
  function publish(cfg, versuch) {
    if (!cfg.pub) return Promise.resolve("");
    versuch = versuch || 1;
    var list = all.filter(function (b) { return b.teilen === true; }).map(function (b) {
      return { id: b.id, name: b.name, datum: b.datum, lat: b.lat, lon: b.lon, hoehe: b.hoehe == null ? null : b.hoehe, layers: b.layers };
    }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    var fehler = function (st) { return " Teilen nicht möglich (" + (st === 403 || st === 404 ? "der Token braucht Zugriff mit Contents: Read and write auf " + cfg.pub : "GitHub-Fehler " + st) + ")."; };
    return ghFetch(cfg, "GET", null, cfg.pub, SHAREFILE).then(function (r) {
      if (r.status === 404) return { sha: null, cur: null };
      if (!r.ok) throw { status: r.status };
      return r.json().then(function (j) { var d = null; try { d = JSON.parse(b64dec(j.content || "")); } catch (e) {} return { sha: j.sha, cur: d }; });
    }).then(function (res) {
      if (res.cur && JSON.stringify(res.cur.bohrungen || []) === JSON.stringify(list)) return " " + list.length + " öffentlich geteilt.";
      var body = { message: "Geteilte Bohrungen aktualisiert", content: b64enc(JSON.stringify({ version: 1, bohrungen: list }, null, 1)) };
      if (res.sha) body.sha = res.sha;
      return ghFetch(cfg, "PUT", body, cfg.pub, SHAREFILE).then(function (r) {
        if ((r.status === 409 || r.status === 422) && versuch < 3) return publish(cfg, versuch + 1);
        if (!r.ok) return fehler(r.status);
        return " " + list.length + " öffentlich geteilt.";
      });
    }).catch(function (e) { return e && e.status ? fehler(e.status) : ""; });
  }
  function scheduleSync(ms) { if (!syncCfg()) return; clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); }
  function sync() {
    var cfg = syncCfg();
    if (!cfg) return Promise.resolve(false);
    if (syncBusy) { syncAgain = true; return Promise.resolve(false); }
    if (navigator.onLine === false) { setSyncMsg("Keine Internetverbindung. Der Abgleich holt sich beim nächsten Mal nach."); return Promise.resolve(false); }
    syncBusy = true; setSyncMsg("Abgleich läuft …");
    function done(msg, ok) { syncBusy = false; setSyncMsg(msg); if (syncAgain) { syncAgain = false; scheduleSync(300); } return ok; }
    function round(versuch) {
      return ghFetch(cfg, "GET").then(function (r) {
        if (r.status === 404) return { remote: null, sha: null };
        if (!r.ok) throw { status: r.status };
        return r.json().then(function (j) { var d = {}; try { d = JSON.parse(b64dec(j.content || "")); } catch (e) {} return { remote: d, sha: j.sha }; });
      }).then(function (res) {
        var m = merge(res.remote);
        if (m.changed) { persistRaw(); drawMarkers(); onChange(); if (panel && panel.querySelector("#oSyncMsg") && panel.querySelector("li")) list(); }
        function finish() { return publish(cfg).then(function (x) { return done("Abgeglichen " + new Date().toLocaleTimeString("de-DE") + ": " + all.length + " Bohrung(en)." + x, true); }); }
        if (!m.remoteDiffers && res.remote) return finish();
        var body = { message: "Eigene Bohrungen abgeglichen", content: b64enc(JSON.stringify({ version: 2, bohrungen: all, geloescht: tomb }, null, 1)) };
        if (res.sha) body.sha = res.sha;
        return ghFetch(cfg, "PUT", body).then(function (r) {
          if ((r.status === 409 || r.status === 422) && versuch < 3) return round(versuch + 1);
          if (!r.ok) throw { status: r.status };
          return finish();
        });
      });
    }
    return round(1).catch(function (e) {
      return done(e && e.status ? fehlerText(e.status) : "Keine Internetverbindung. Der Abgleich holt sich beim nächsten Mal nach.", false);
    });
  }
  function syncHtml() {
    var c = syncCfg();
    return '<div class="box" id="oSync"><h3>Auf allen Geräten (GitHub)</h3>' +
      '<details><summary>Anleitung in 5 Schritten</summary><ol class="meta">' +
      '<li>Auf github.com ein <b>privates</b> Repository anlegen, z. B. „bohrungen-daten“ (mit README, damit es nicht leer ist).</li>' +
      '<li>Settings → Developer settings → Fine-grained tokens: neuen Token erzeugen, nur dieses Repository, Berechtigung „Contents: Read and write“.</li>' +
      '<li>Hier Repository (benutzername/bohrungen-daten) und Token eintragen. Zum Teilen muss der Token zusätzlich auf das Repository dieser App „Contents: Read and write“ haben.</li>' +
      '<li>„Verbinden und abgleichen“ tippen.</li>' +
      '<li>Auf jedem weiteren Gerät dasselbe eintragen, dann sind alle gleich.</li></ol>' +
      '<p class="meta">Das Repository muss privat sein, sonst sind die Standorte öffentlich. Der Token wird nur in diesem Gerät gespeichert und nur an GitHub gesendet.</p></details>' +
      '<label class="meta">Repository<br><input type="text" id="oRepo" placeholder="benutzername/bohrungen-daten" autocapitalize="off" autocorrect="off" value="' + esc(c ? c.repo : "") + '"></label><br>' +
      '<label class="meta">Öffentliches Repository dieser App (für geteilte Bohrungen, leer = nichts teilen)<br><input type="text" id="oPub" autocapitalize="off" autocorrect="off" value="' + esc(c ? (c.pub || "") : defaultPub()) + '"></label><br>' +
      '<label class="meta">Token<br><input type="password" id="oToken" placeholder="github_pat_…" autocomplete="off" value="' + (c ? "••••••••" : "") + '"></label>' +
      '<div class="tools"><button type="button" id="oSyncGo">Verbinden und abgleichen</button>' + (c ? '<button type="button" class="ghost" id="oSyncOff">Trennen</button>' : "") + '</div>' +
      '<p class="meta" id="oSyncMsg">' + esc(syncMsg || (c ? "Verbunden mit " + c.repo + "." : "Nicht verbunden.")) + '</p></div>';
  }
  function defaultPub() {
    try { var h = location.hostname; if (/\.github\.io$/.test(h)) { var r = location.pathname.split("/")[1]; if (r) return h.split(".")[0] + "/" + r; } } catch (e) {}
    return "";
  }
  function bindSync() {
    var go = panel.querySelector("#oSyncGo"); if (!go) return;
    go.addEventListener("click", function () {
      var old = syncCfg(), repo = panel.querySelector("#oRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, ""), tok = panel.querySelector("#oToken").value.trim();
      if (tok === "••••••••" && old) tok = old.token;
      var pub = panel.querySelector("#oPub").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
      if (pub && !/^[\w.-]+\/[\w.-]+$/.test(pub)) { setSyncMsg("Das öffentliche Repository bitte als benutzername/name eintragen oder leer lassen."); return; }
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !tok) { setSyncMsg("Bitte Repository (benutzername/name) und Token eintragen."); return; }
      try { localStorage.setItem(SKEY, JSON.stringify({ repo: repo, token: tok, pub: pub })); } catch (e) { setSyncMsg("Speichern der Verbindung im Gerät nicht möglich."); return; }
      sync().then(function (ok) { if (!ok && /Token|Zugriff|Repository nicht/.test(syncMsg)) { /* Verbindung behalten, Nutzer kann Eingabe korrigieren */ } });
    });
    var off = panel.querySelector("#oSyncOff");
    if (off) off.addEventListener("click", function () { try { localStorage.removeItem(SKEY); } catch (e) {} syncMsg = ""; list(); });
  }

  function list() {
    var h = '<h2>Meine Bohrungen (' + all.length + ')</h2>';
    if (!all.length) h += '<p class="hint">Noch keine eigene Bohrung gespeichert.</p>';
    else {
      h += '<ul class="list">';
      all.slice().sort(function (a, b) { return b.erstellt - a.erstellt; }).forEach(function (b) {
        h += '<li data-id="' + b.id + '"><div class="body"><div class="row"><span class="name">' + esc(b.name) + '</span><span class="meta">' + esc(b.datum) + '</span></div><div class="meta">Endteufe ' + fmtN(depthOf(b)) + ' m · ' + b.layers.length + ' Schichten' + (b.teilen === true ? ' · öffentlich' : '') + '</div></div></li>';
      });
      h += "</ul>";
    }
    h += '<div class="tools"><button type="button" class="ghost" id="oNew">Neue Bohrung</button><button type="button" class="ghost" id="oBackup">Alle sichern (Datei)</button>' +
      '<label class="ghost-file">Sicherung einlesen<input type="file" id="oRestore" accept="application/json,.json" hidden></label><button type="button" class="ghost" id="oClose">Schließen</button></div>' +
      '<p class="meta">Die Bohrungen liegen im Gerät und, wenn unten verbunden, zusätzlich in deinem privaten GitHub-Repository. Sichere sie trotzdem gelegentlich als Datei.</p>' + syncHtml();
    panel.innerHTML = h; scrollToPanel(); bindSync();
    panel.querySelectorAll("li").forEach(function (li) { li.addEventListener("click", function () { show(li.dataset.id); }); });
    panel.querySelector("#oNew").addEventListener("click", function () { open(); });
    panel.querySelector("#oClose").addEventListener("click", function () { panel.innerHTML = ""; });
    panel.querySelector("#oBackup").addEventListener("click", function () { download("eigene-bohrungen-" + today() + ".json", JSON.stringify({ version: 2, bohrungen: all, geloescht: tomb }, null, 1), "application/json"); });
    panel.querySelector("#oRestore").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result), arr = d.bohrungen || [];
          var added = 0;
          arr.forEach(function (b) { if (b && b.id && b.layers && !all.some(function (x) { return x.id === b.id; })) { if (!b.geaendert) b.geaendert = Date.now(); delete tomb[b.id]; all.push(b); added++; } });
          persist(); drawMarkers(); onChange(); alert(added + " Bohrung(en) eingelesen.\n(" + (arr.length - added) + " schon vorhanden)."); list();
        } catch (err) { alert("Die Datei konnte nicht gelesen werden."); }
      };
      r.readAsText(f);
    });
  }

  global.EIGENE = {
    init: function (opts) {
      map = opts.map; panel = opts.panel; esc = opts.esc; fmtN = opts.fmtN; onChange = opts.onChange || onChange;
      markers = L.layerGroup().addTo(map); load(); drawMarkers(); loadShared();
      if (syncCfg()) { sync(); window.addEventListener("online", function () { scheduleSync(500); loadShared(); }); }
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    },
    open: function () { open(); }, list: list, show: show, asBohrungen: asBohrungen,
    handleMapClick: function (e) { if (!picking || !draft) return false; setPos(e.latlng.lat, e.latlng.lng); panel.scrollIntoView({ block: "start" }); return true; },
    setVisible: function (on) { if (on) { if (!map.hasLayer(markers)) markers.addTo(map); } else if (map.hasLayer(markers)) map.removeLayer(markers); },
    count: function () { return all.length; }, sync: sync
  };
})(window);
