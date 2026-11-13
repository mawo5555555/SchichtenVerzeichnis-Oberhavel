# Wünschelroute 2.0

Offline-fähige Web-App: Standort in Brandenburg wählen, aus den umliegenden Bohrungen wird ein geschätztes
Schichtenverzeichnis mit Vermutung zu den Grundwasserleitern berechnet. Die Bohrungen aller angehakten Landkreise
(Oberhavel und Ostprignitz-Ruppin voreingestellt, weitere Landkreise je nach Ausbau; sie werden erst nach dem Anhaken geladen) fließen gemeinsam ein, auch über Kreisgrenzen hinweg. Alles ist eine Schätzung, keine Messung.

## Landkreise

Jeder Landkreis hat einen Ordner `data/<kreis-id>/` mit einer Datei `daten.js`. Neuer Landkreis:
1. `ruby tools/fetch_boreholes.rb <kreis-id>`, `fetch_basemap.rb`, `fetch_elevation.rb`, `fetch_aquifer_grid.rb` (jeweils mit derselben Kreis-ID) ausführen.
2. `ruby tools/build_kreis.rb <kreis-id> "Landkreis Name"` erzeugt `data/<kreis-id>/daten.js`.
3. Die Kreis-ID in `index.html` (`<script src="data/<kreis-id>/daten.js">`) und in `sw.js` (`DATEIEN`) eintragen, `VERSION` erhöhen.

Die Grenze jedes Landkreises liegt in `data/<kreis-id>/grenze.geojson` (© OpenStreetMap-Mitwirkende, Nominatim). Sie dient nur zur Anzeige und zum Abgrenzen der Abrufe, nicht zum Ausschluss von Bohrungen.

Auf dem Handy: Seite in Safari öffnen, *Teilen, Zum Home-Bildschirm*. Danach läuft sie auch ohne Internet.

## Quellen

- Bohrungen, Schichtenverzeichnisse, Grundwasserleiter (alle Landkreise): © Landesamt für Bergbau, Geologie und Rohstoffe Brandenburg,
  Datenlizenz Deutschland, Namensnennung, Version 2.0 (https://www.govdata.de/dl-de/by-2-0)
- Landkreisgrenzen (Nominatim-Abruf), Orte, Straßen, Gewässer: © OpenStreetMap-Mitwirkende (ODbL)
- Geländehöhen (Relief, Höhenlinien, alle Landkreise): EU-DEM / Copernicus, über opentopodata.org
- Grundwasserleiter-Übersicht je Landkreis: Umweltgeologische Karte 1 : 300 000 des LBGR Brandenburg (WMS)
- Kartenbibliothek: Leaflet (BSD-2-Clause)

Die Schichten wurden per Texterkennung aus den Bildern des Landes gelesen und können Abweichungen enthalten.
