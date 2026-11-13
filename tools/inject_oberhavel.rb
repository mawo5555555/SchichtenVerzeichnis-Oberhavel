# Ergänzt data/oberhavel/daten.js (stammt aus dem Oberhavel-Paket) um die später berechneten Zusatzdaten:
# hyk, eignung, hydroraum, isohypsen. Aufruf: ruby tools/inject_oberhavel.rb
require 'json'
Encoding.default_external = Encoding::UTF_8
ROOT = File.expand_path('..', __dir__)
f = File.join(ROOT, 'data', 'oberhavel', 'daten.js'); s = File.read(f)
i = s.index(/=\s+\{"id"/); i = s.index('{', i); head = s[0...i]
j = JSON.parse(s[i..].sub(/;\s*\z/, ''))
d = File.join(ROOT, 'data', 'oberhavel')
j['hyk'] = JSON.parse(File.read(File.join(d, 'hyk.json'))) if File.exist?(File.join(d, 'hyk.json'))
j['eignung'] = JSON.parse(File.read(File.join(d, 'eignung.json'))) if File.exist?(File.join(d, 'eignung.json'))
j['hydroraum'] = JSON.parse(File.read(File.join(d, 'hydroraum.json'))) if File.exist?(File.join(d, 'hydroraum.json'))
j['isohypsen'] = JSON.parse(File.read(File.join(d, 'isohypsen.json'))).select { |l| [3, 4, 5, 6].include?(l[0]) } if File.exist?(File.join(d, 'isohypsen.json'))
File.write(f, head + JSON.generate(j) + ";\n")
puts "oberhavel/daten.js: #{File.size(f) / 1024} KB"
