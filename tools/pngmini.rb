require 'zlib'
# Minimaler PNG-Leser für 8-Bit RGB/RGBA ohne Interlace
def read_png(bytes)
  i = 8; idat = ''.b; w = h = ct = nil
  while i < bytes.size
    len = bytes[i, 4].unpack1('N'); t = bytes[i + 4, 4]
    if t == 'IHDR' then w, h = bytes[i + 8, 8].unpack('NN'); ct = bytes.getbyte(i + 8 + 9) end
    idat << bytes[i + 8, len] if t == 'IDAT'
    i += 12 + len
  end
  bpp = ct == 6 ? 4 : ct == 2 ? 3 : (raise "Farbtyp #{ct}")
  raw = Zlib::Inflate.inflate(idat); stride = w * bpp
  rows = []; prev = Array.new(stride, 0)
  h.times do |y|
    f = raw.getbyte(y * (stride + 1)); line = raw.byteslice(y * (stride + 1) + 1, stride).bytes
    stride.times do |x|
      a = x >= bpp ? line[x - bpp] : 0; b = prev[x]; c = x >= bpp ? prev[x - bpp] : 0
      line[x] = (line[x] + case f when 0 then 0 when 1 then a when 2 then b when 3 then (a + b) / 2 else (p = a + b - c; pa = (p - a).abs; pb = (p - b).abs; pc = (p - c).abs; pa <= pb && pa <= pc ? a : pb <= pc ? b : c) end) & 255
    end
    rows << line; prev = line
  end
  { w: w, h: h, bpp: bpp, rows: rows }
end
def px(img, x, y) img[:rows][y][x * img[:bpp], 3] end
