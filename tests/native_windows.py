"""Run the fixed UI playthroughs in the same executable users download."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
game = ROOT / "dist" / "SnakesAndLadders.exe"
process = subprocess.run([str(game), "--self-test"], stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, timeout=480, encoding="utf-8")
print("Windows EXE self-test", process.stdout, flush=True)
process.check_returncode()
report = json.loads(process.stdout)
assert report["done"] and len(report["matches"]) == 6
