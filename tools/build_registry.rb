# Schreibt data/kreise.js: die Liste der Landkreise (Name, Datei, Zahl der Bohrungen, Größe) für die Auswahl in der Seite.
# Aufruf: ruby tools/build_registry.rb
require 'json'
Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
REIHE = [['oberhavel', 'Landkreis Oberhavel', true], ['ostprignitz-ruppin', 'Landkreis Ostprignitz-Ruppin', true],
         ['havelland', 'Landkreis Havelland', false], ['prignitz', 'Landkreis Prignitz', false],
         ['barnim', 'Landkreis Barnim', false], ['uckermark', 'Landkreis Uckermark', false]]
out = []
REIHE.each do |id, name, std|
  f = File.join(ROOT, 'data', id, 'daten.js'); next unless File.exist?(f)
  s = File.read(f); i = s.index(/=\s+\{"id"/); j = JSON.parse(s[s.index('{', i)..].sub(/;\s*\z/, ''))
  b = j['bohrungen']
  out << { id: id, name: name, datei: "data/#{id}/daten.js", n: b.size, nl: b.count { |x| x['l'] }, mb: (File.size(f) / 1048576.0).round(1), standard: std }
end
File.write(File.join(ROOT, 'data', 'kreise.js'), "window.KREISE_LISTE = #{JSON.generate(out)};\n")
puts out.map { |k| "#{k[:id]}: #{k[:n]} Bohrungen (#{k[:nl]} mit Schichten), #{k[:mb]} MB" }
