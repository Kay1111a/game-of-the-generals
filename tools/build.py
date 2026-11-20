from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'dist'
out.mkdir(exist_ok=True)
(out/'SnakesAndLadders.html').write_bytes((root/'index.html').read_text(encoding='utf8').encode())
