import os, zlib, struct

def create_png(width, height):
    start = (74, 144, 226)  # #4A90E2
    end = (123, 63, 151)    # #7B3F97
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            ratio = x / (width - 1) if width > 1 else 0
            r = int(start[0] + (end[0] - start[0]) * ratio)
            g = int(start[1] + (end[1] - start[1]) * ratio)
            b = int(start[2] + (end[2] - start[2]) * ratio)
            a = 255
            row.extend([r, g, b, a])
        rows.append(bytes(row))
    raw = b''.join(b'\x00' + row for row in rows)
    compressed = zlib.compress(raw)
    def chunk(t, d):
        return struct.pack('!I', len(d)) + t + d + struct.pack('!I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

base_dir = r'C:\Users\seraj\.gemini\antigravity\scratch\notebook-to-anki-bridge\icons'
os.makedirs(base_dir, exist_ok=True)
for s in [16, 32, 48, 96, 128]:
    data = create_png(s, s)
    path = os.path.join(base_dir, f'logo-{s}.png')
    with open(path, 'wb') as f:
        f.write(data)
print('Generated icons in', base_dir)
