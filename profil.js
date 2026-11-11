/* Gemeinsame Auswertung: aus den Schichten umliegender Bohrungen wird ein geschätztes Schichtenverzeichnis berechnet,
 * samt Vermutung zu den Grundwasserleitern (Sand und Kies, auch tiefere). Ohne Netzwerk, reine Berechnung.
 * Eingang: items = [{ prof: { layers: [{from,to,text,cat}], depthRead }, d: Entfernung in m }]
 * Kopiert aus schichtenverzeichnis/index.html (dort Teil der Online-Version). */
(function (global) {
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function fmtN(x, n) { return x.toFixed(n === undefined ? 1 : n).replace(".", ","); }
  /* ---------- Schichten aus dem Bild lesen ---------- */
  var AQUIFER_CATS = ["Feinsand", "Mittelsand", "Grobsand", "Sand (o. n. A.)", "Kies"];
  var CAT_COL = {
    "Feinsand": "#f4a6a6", "Mittelsand": "#e57373", "Grobsand": "#d32f2f", "Sand (o. n. A.)": "#ef5350", "Kies": "#8e1b1b",
    "Geschiebemergel / Lehm": "#a8a29e", "Ton": "#6f6760", "Schluff": "#c9c4b8", "Torf / Mudde": "#4a4036",
    "Sand (ohne GWL)": "#e6d8a2", "Kies (ohne GWL)": "#c9b57a", "Auffüllung / Boden": "#dcdcdc", "Braunkohle": "#262626", "Festgestein": "#52607a", "Sonstiges": "#b8b8b8"
  };
  function isAquifer(cat) { return AQUIFER_CATS.indexOf(cat) >= 0; }

  /* ---------- Geschätztes Schichtenverzeichnis aus den Nachbarbohrungen ---------- */
  function groupOf(cat) { return isAquifer(cat) ? "Sand/Kies" : cat; }
  function groupColor(g) { return g === "Sand/Kies" ? "#e53935" : (CAT_COL[g] || "#b8b8b8"); }

  function buildExpected(items) {
    var maxD = 0;
    items.forEach(function (it) { if (it.prof.depthRead > maxD) maxD = it.prof.depthRead; });
    maxD = Math.min(Math.ceil(maxD), 250);
    var bins = [];
    for (var d = 0; d < maxD; d++) {
      var c = d + 0.5, gW = {}, cW = {}, tot = 0, cnt = 0;
      items.forEach(function (it) {
        var p = it.prof;
        if (p.depthRead < c) return;
        for (var k = 0; k < p.layers.length; k++) {
          var l = p.layers[k];
          if (l.from <= c && c < l.to) {
            var w = 1 / (it.d + 100);          // nähere Bohrungen zählen stärker
            var g = groupOf(l.cat);
            gW[g] = (gW[g] || 0) + w; cW[l.cat] = (cW[l.cat] || 0) + w; tot += w; cnt++;
            return;
          }
        }
      });
      bins.push({ cnt: cnt, tot: tot, gW: gW, cW: cW });
    }
    // bis zu welcher Tiefe tragen die Daten: mindestens 40 % der Bohrungen (mindestens 2, bei einer Bohrung 1)
    var minN = items.length === 1 ? 1 : Math.max(2, Math.ceil(items.length * 0.4));
    var limit = 0, deep = 0;
    for (var i = 0; i < bins.length; i++) { if (bins[i].cnt >= minN) limit = i + 1; else break; }
    // tiefer als „gut belegt“ gibt es oft nur noch einzelne Bohrungen; sie werden trotzdem ausgewertet, aber als dünn belegt gekennzeichnet
    for (var i2 = 0; i2 < bins.length; i2++) { if (bins[i2].cnt >= 1) deep = i2 + 1; }
    // je Meter die häufigste Gesteinsgruppe, aufeinanderfolgende gleiche zu Schichten verbinden
    var segs = [];
    for (var m = 0; m < deep; m++) {
      var b = bins[m], best = null;
      Object.keys(b.gW).forEach(function (g) { if (best === null || b.gW[g] > b.gW[best]) best = g; });
      if (best === null) continue;
      var share = b.gW[best] / b.tot;
      var last = segs[segs.length - 1];
      if (last && last.g === best) { last.to = m + 1; last.shareSum += share; last.minCnt = Math.min(last.minCnt, b.cnt); }
      else segs.push({ g: best, from: m, to: m + 1, shareSum: share, minCnt: b.cnt });
    }
    // sehr dünne Schichten (unter 1,5 m) der größeren Nachbarschicht zuschlagen
    var changed = true;
    while (changed && segs.length > 1) {
      changed = false;
      for (var s = 0; s < segs.length; s++) {
        var sg = segs[s];
        if (sg.to - sg.from >= 1.5) continue;
        var prev = segs[s - 1], next = segs[s + 1];
        var tgt = (!prev) ? next : (!next) ? prev : ((prev.to - prev.from) >= (next.to - next.from) ? prev : next);
        tgt.from = Math.min(tgt.from, sg.from); tgt.to = Math.max(tgt.to, sg.to); tgt.shareSum += sg.shareSum;
        tgt.minCnt = Math.min(tgt.minCnt, sg.minCnt);
        segs.splice(s, 1);
        // benachbarte gleiche Gruppen verbinden
        for (var q = segs.length - 1; q > 0; q--) {
          if (segs[q].g === segs[q - 1].g) {
            segs[q - 1].to = segs[q].to; segs[q - 1].shareSum += segs[q].shareSum;
            segs[q - 1].minCnt = Math.min(segs[q - 1].minCnt, segs[q].minCnt); segs.splice(q, 1);
          }
        }
        changed = true;
        break;
      }
    }
    // Namen, Sicherheit und Grundwasserleiter-Vermutung je Schicht
    segs.forEach(function (sg) {
      var th = sg.to - sg.from;
      sg.conf = sg.shareSum / th;
      sg.aq = sg.g === "Sand/Kies" && th >= 2;
      sg.thin = sg.minCnt < minN;                 // weniger Bohrungen als für eine gute Absicherung nötig
      sg.name = sg.g;
      if (sg.g === "Sand/Kies") {
        var cw = {};
        for (var d2 = sg.from; d2 < sg.to; d2++) {
          Object.keys(bins[d2].cW).forEach(function (cat) { if (isAquifer(cat)) cw[cat] = (cw[cat] || 0) + bins[d2].cW[cat]; });
        }
        var top = null;
        Object.keys(cw).forEach(function (cat) { if (top === null || cw[cat] > cw[top]) top = cat; });
        sg.name = top ? "Sand/Kies, überwiegend " + top : "Sand/Kies";
      }
    });
    return { segs: segs, limit: limit, deep: deep, minN: minN, maxD: maxD };
  }

  function confText(c) { return c >= 0.75 ? "ziemlich einheitlich" : c >= 0.5 ? "teils uneinheitlich" : "unsicher"; }

  function renderExpected(box, items, nSel, bad) {
    if (!items.length) {
      box.innerHTML = '<h2>Erwartetes Schichtenverzeichnis</h2><p class="hint">Aus den Bohrungen in der Umgebung ließ sich kein Profil sicher auslesen' +
        (bad ? ' (' + bad + ' nicht lesbar)' : '') + '. Wähle einen größeren Umkreis oder einen anderen Punkt.</p>';
      return;
    }
    var r = buildExpected(items);
    var segs = r.segs;
    if (!segs.length) {
      box.innerHTML = '<h2>Erwartetes Schichtenverzeichnis</h2><p class="hint">Die ausgewerteten Bohrungen überlappen sich in der Tiefe zu wenig für eine Schätzung.</p>';
      return;
    }
    var span = r.deep || r.limit;
    var ppm = Math.max(3, Math.min(12, 520 / span)), H = Math.round(span * ppm);
    var tickStep = span > 100 ? 20 : span > 50 ? 10 : 5;
    var col = '', ticks = '', labs = '';
    for (var d = 0; d <= span; d += tickStep) {
      ticks += '<div class="tick" style="top:' + (d * ppm) + 'px">' + d + ' m</div><div class="tickline" style="top:' + (d * ppm) + 'px"></div>';
    }
    segs.forEach(function (sg) {
      var top = sg.from * ppm, h = (sg.to - sg.from) * ppm;
      col += '<div class="seg' + (sg.aq ? ' aq' : '') + (sg.thin ? ' thin' : '') + '" style="top:' + top + 'px;height:' + h + 'px;background:' + groupColor(sg.g) + '"></div>';
      if (h >= 15) labs += '<div class="lab' + (sg.aq ? ' aq' : '') + '" style="top:' + (top + h / 2) + 'px">' + esc(sg.name) + (sg.thin ? ' (dünn belegt)' : '') + '</div>';
    });
    var table = '<table class="layers"><tr><td class="meta">Tiefe (m)</td><td class="meta">erwartetes Gestein</td><td class="meta">Bohrungen</td><td class="meta">Sicherheit</td></tr>';
    segs.forEach(function (sg) {
      table += '<tr class="' + (sg.aq ? 'gwl' : '') + '"><td>' + sg.from + ' – ' + sg.to + '</td><td>' + esc(sg.name) + (sg.aq ? ' (vermutlicher Grundwasserleiter)' : '') +
               '</td><td>' + sg.minCnt + (sg.thin ? ' (dünn)' : '') + '</td><td>' + confText(sg.conf) + '</td></tr>';
    });
    table += '</table>';

    // Aussage zum Grundwasserleiter
    var aqs = segs.filter(function (sg) { return sg.aq; });
    var verdict;
    if (aqs.length) {
      var first = aqs[0], th = first.to - first.from;
      var above = segs.filter(function (sg) { return sg.to <= first.from; });
      verdict = '<b>Vermutung:</b> ';
      if (!above.length || first.from < 1) {
        verdict += 'Sand/Kies reicht vermutlich schon von der Oberfläche an, also ohne nennenswerte Deckschicht, bis etwa ' + first.to + ' m Tiefe.';
      } else {
        verdict += 'Der erste Grundwasserleiter liegt vermutlich ab etwa <b>' + first.from + ' m Tiefe</b> und ist grob <b>' + th + ' m</b> mächtig (' + esc(first.name) + '). Darüber folgen ' +
          above.map(function (sg) { return esc(sg.name) + ' (' + (sg.to - sg.from) + ' m)'; }).join(', ') + '.';
        if (above.some(function (sg) { return /Geschiebemergel|Ton|Schluff|Torf/.test(sg.g); })) {
          verdict += ' Bindige Schichten darüber können den Leiter nach oben abdichten.';
        }
      }
      if (aqs.length > 1) {
        verdict += '<br><b>Tiefere Grundwasserleiter (alle gefundenen):</b> ' + aqs.slice(1).map(function (sg) {
          return sg.from + '–' + sg.to + ' m (' + (sg.to - sg.from) + ' m mächtig, ' + sg.minCnt + ' Bohrung' + (sg.minCnt > 1 ? 'en' : '') + (sg.thin ? ', nur dünn belegt' : '') + ')';
        }).join('; ') + '.';
      }
    } else {
      verdict = '<b>Vermutung:</b> Im ausgewerteten Tiefenbereich ist kein zusammenhängender Sand- oder Kieskörper von mindestens 2 m zu erkennen.';
    }
    verdict += '<br><span class="meta">Das Schichtenverzeichnis sagt nicht, wo das Grundwasser tatsächlich steht. Das ist eine Schätzung, keine Messung.</span>';

    var details = detailRows(items.map(function (it) { return it.prof; }));
    box.innerHTML = '<h2>Erwartetes Schichtenverzeichnis am gewählten Punkt</h2>' +
      '<p class="hint">Aus ' + items.length + ' Bohrung' + (items.length > 1 ? 'en' : '') + ' der Umgebung gemittelt, nähere Bohrungen zählen stärker' +
      (bad ? ' (' + bad + ' nicht lesbar, nicht berücksichtigt)' : '') + '. Grober Anhaltspunkt, er ersetzt keine Bohrung. Gut belegt ist die Schätzung bis etwa ' + r.limit + ' m Tiefe' +
      (r.deep > r.limit ? '; darunter bis ' + r.deep + ' m stützt sie sich nur noch auf wenige Bohrungen (blasser dargestellt, „dünn belegt“)' : '') + '.</p>' +
      '<div class="synth" style="height:' + H + 'px"><div class="col" style="top:0;height:' + H + 'px">' + col + '</div>' + ticks + labs + '</div>' +
      '<div class="legend"><span><span class="sw" style="background:#e53935"></span>Sand/Kies (rot, mögliche Grundwasserleiter)</span>' +
      '<span><span class="sw" style="background:' + CAT_COL["Geschiebemergel / Lehm"] + '"></span>Geschiebemergel / Lehm</span>' +
      '<span><span class="sw" style="background:' + CAT_COL["Schluff"] + '"></span>Schluff</span>' +
      '<span><span class="sw" style="background:' + CAT_COL["Ton"] + '"></span>Ton</span>' +
      '<span><span class="sw" style="background:' + CAT_COL["Torf / Mudde"] + '"></span>Torf / Mudde</span></div>' +
      '<div class="verdict">' + verdict + '</div>' + table +
      '<details class="more"><summary>Einzelheiten je Meter anzeigen</summary>' + details + '</details>';
  }

  function detailRows(profs) {
    var maxD = 0;
    profs.forEach(function (p) { if (p.depthRead > maxD) maxD = p.depthRead; });
    maxD = Math.min(Math.ceil(maxD), 250);
    var usedCats = {}, rowsHtml = '', gw10 = 0, gw20 = 0, n10 = 0, n20 = 0;
    for (var d = 0; d < maxD; d++) {
      var c = d + 0.5, counts = {}, n = 0;
      profs.forEach(function (p) {
        if (p.depthRead < c) return;
        for (var k = 0; k < p.layers.length; k++) {
          if (p.layers[k].from <= c && c < p.layers[k].to) { counts[p.layers[k].cat] = (counts[p.layers[k].cat] || 0) + 1; n++; return; }
        }
      });
      if (!n) continue;
      var seg = '', aq = 0;
      Object.keys(CAT_COL).forEach(function (cat) {
        if (!counts[cat]) return;
        usedCats[cat] = true;
        if (isAquifer(cat)) aq += counts[cat];
        seg += '<span style="width:' + (counts[cat] / n * 100) + '%;background:' + CAT_COL[cat] + '" title="' + esc(cat) + ': ' + Math.round(counts[cat] / n * 100) + ' %"></span>';
      });
      var share = aq / n;
      if (d < 10) { gw10 += share; n10++; }
      if (d < 20) { gw20 += share; n20++; }
      rowsHtml += '<div class="avgrow"><span>' + ((d % 5 === 0) ? d + ' m' : '') + '</span><div class="avgbar">' + seg + '</div>' +
                  '<span class="pct' + (share >= 0.5 ? ' red' : '') + '">' + Math.round(share * 100) + ' % · n=' + n + '</span></div>';
    }
    var legend = Object.keys(CAT_COL).filter(function (k) { return usedCats[k]; }).map(function (k) {
      return '<span><span class="sw" style="background:' + CAT_COL[k] + '"></span>' + esc(k) + '</span>';
    }).join('');
    var html = '<p class="hint">Jede Zeile ist 1 m, oben ist 0 m. Die Balken zeigen, welcher Anteil der Bohrungen in dieser Tiefe welches Gestein hat (alle Bohrungen gleich gewichtet); Rottöne sind Sand und Kies (Grundwasserleiter). n ist die Zahl der Bohrungen, die diese Tiefe erreichen.</p>' +
      '<div class="box"><table class="facts">' +
      (n10 ? '<tr><td>Sand/Kies bis 10 m Tiefe</td><td>im Mittel ' + Math.round(gw10 / n10 * 100) + ' % der Strecke</td></tr>' : '') +
      (n20 ? '<tr><td>Sand/Kies bis 20 m Tiefe</td><td>im Mittel ' + Math.round(gw20 / n20 * 100) + ' % der Strecke</td></tr>' : '') +
      '</table></div><div class="legend">' + legend + '</div>' + rowsHtml;
    return html;
  }

  // Zeichnet das Schichtenverzeichnis einer Bohrung selbst als Säule (ohne Bild des Landes): 0 m oben, Tiefen links, Gestein rechts,
  // Sand und Kies (mögliche Grundwasserleiter) mit rotem Rand. layers = [[von, bis, Text, Kategorie], ...]
  function drawColumn(layers) {
    if (!layers || !layers.length) return "";
    var total = layers[layers.length - 1][1];
    var H = Math.max(150, Math.min(560, Math.round(total * 8))), ppm = H / total;
    var step = total <= 12 ? 1 : total <= 30 ? 2 : total <= 80 ? 5 : total <= 200 ? 10 : 25;
    var X0 = 64, W = 56, top = 14, svg = '<svg viewBox="0 0 340 ' + (H + 28) + '" width="100%" style="max-width:340px;display:block;margin:4px 0 6px" role="img" aria-label="Schichtenverzeichnis, 0 Meter oben">';
    var d;
    for (d = 0; d <= total; d += step) {
      svg += '<line x1="' + (X0 - 6) + '" y1="' + (top + d * ppm) + '" x2="' + X0 + '" y2="' + (top + d * ppm) + '" stroke="currentColor" stroke-opacity=".5"/>' +
             '<text x="' + (X0 - 9) + '" y="' + (top + d * ppm + 3.5) + '" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">' + d + ' m</text>';
    }
    var lastLabelY = -99;
    layers.forEach(function (l) {
      var y = top + l[0] * ppm, h = (l[1] - l[0]) * ppm, aq = isAquifer(l[3]);
      svg += '<rect x="' + X0 + '" y="' + y + '" width="' + W + '" height="' + h + '" fill="' + (CAT_COL[l[3]] || "#b8b8b8") + '" stroke="' + (aq ? "#b71c1c" : "#333") + '" stroke-width="' + (aq ? 1.6 : 0.8) + '"/>';
      var mid = y + h / 2;
      if (h >= 11 && mid - lastLabelY >= 12) {
        svg += '<text x="' + (X0 + W + 8) + '" y="' + (mid + 3.5) + '" font-size="11" fill="' + (aq ? "#d32f2f" : "currentColor") + '"' + (aq ? ' font-weight="600"' : '') + '>' + esc(l[2]) + '</text>';
        lastLabelY = mid;
      }
    });
    return svg + '</svg>';
  }

  global.PROFIL = { drawColumn: drawColumn, renderExpected: renderExpected, buildExpected: buildExpected, CAT_COL: CAT_COL, isAquifer: isAquifer, esc: esc, fmtN: fmtN };
})(window);
