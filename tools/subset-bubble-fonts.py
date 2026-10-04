"""Rebuild the renamed Han subset from the verified, pinned source archive.

Run after collecting bubble text: node tools/bubble-codepoints.mjs
Then: python tools/subset-bubble-fonts.py
Development only: fonttools and brotli are required; plugin builds stay offline.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.font-tools'))
from fontTools import subset, __version__
from fontTools.ttLib import TTFont

archive = (ROOT / 'artifacts/zcool-kuaile-5.3.0.tgz').read_bytes()
expected = 'jn4vpQ6QSVEckUn7uk5a9XcZMxEksTRqljmeE1VKRGMjGd6VoXdMyLGSdnTXSVwZLCCEHaIcm/2cdQuwvasJ9w=='
assert base64.b64encode(hashlib.sha512(archive).digest()).decode() == expected, 'Source integrity mismatch'
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
    source = bundle.extractfile('package/files/zcool-kuaile-chinese-simplified-400-normal.woff2').read()
    license_text = bundle.extractfile('package/LICENSE').read()
assert license_text.replace(b'\r\n', b'\n') == (ROOT / 'assets/fonts/OFL-ZCOOL-KuaiLe.txt').read_bytes().replace(b'\r\n', b'\n'), 'License mismatch'
font = TTFont(io.BytesIO(source), recalcTimestamp=False)
latin = TTFont(ROOT / 'assets/fonts/bubble-en.woff2')
points = set(json.loads((ROOT / 'artifacts/bubble-codepoints.json').read_text('utf-8')))
needed = points - set(latin.getBestCmap())
missing = needed - set(font.getBestCmap())
assert not missing, f'Source font lacks glyphs: {sorted(missing)}'
options = subset.Options()
options.flavor = 'woff2'
options.recalc_timestamp = False
options.name_IDs = ['*']
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=needed)
subsetter.subset(font)
for record in font['name'].names:
    value = {1: 'Whale Bubble Han', 2: 'Regular', 3: 'WhaleBubbleHan-Regular',
             4: 'Whale Bubble Han Regular', 6: 'WhaleBubbleHan-Regular',
             16: 'Whale Bubble Han', 17: 'Regular'}.get(record.nameID)
    if value is not None:
        record.string = value.encode(record.getEncoding())
font.flavor = 'woff2'
output = ROOT / 'assets/fonts/bubble-zh.woff2'
font.save(output)
actual = TTFont(output)
manifest_path = ROOT / 'assets/fonts/manifest.json'
manifest = json.loads(manifest_path.read_text('utf-8'))
entry = next(item for item in manifest['fonts'] if item['language'] == 'zh')
entry.update(bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
             sourceSha256=hashlib.sha256(source).hexdigest(), codepoints=sorted(actual.getBestCmap()),
             fontToolsVersion=__version__)
# Record actual current text, removing stale copy from earlier releases.
for key in list(manifest):
    if key != 'fonts' and isinstance(manifest[key], list) and all(isinstance(p, int) for p in manifest[key]):
        manifest[key] = sorted(points)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print(json.dumps({'bytes': entry['bytes'], 'glyphs': len(entry['codepoints']), 'textCodepoints': len(points)}))
