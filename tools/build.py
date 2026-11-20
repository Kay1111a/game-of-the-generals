"""Package the game, including its font and license, as one offline HTML file."""
import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "styles.css").read_text(encoding="utf-8")
# All runtime assets are inline. Keep the packaged board offline on every host.
policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="' + policy + '">')
font = base64.b64encode((ROOT / "assets/display.ttf").read_bytes()).decode("ascii")
css = css.replace("assets/display.ttf", "data:font/ttf;base64," + font)
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")
for name in ("rules", "opponent", "app"):
    source = (ROOT / f"src/{name}.js").read_text(encoding="utf-8")
    html = html.replace(f'<script src="src/{name}.js"></script>', f"<script>\n{source}\n</script>")
license_text = (ROOT / "assets/FONT-LICENSE.txt").read_text(encoding="utf-8")
html = html.replace("</body>", '<script type="text/plain" id="font-license">\n' + license_text + "\n</script>\n</body>")
output = ROOT / "dist" / "Salpakan.html"
output.parent.mkdir(exist_ok=True)
payload = html.encode("utf-8")
output.write_bytes(payload)
print(f"Built {output.name} ({len(payload):,} bytes), SHA-256 {hashlib.sha256(payload).hexdigest()}")
