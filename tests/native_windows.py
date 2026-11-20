"""Run the fixed UI playthroughs in the same executable users download."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
game = ROOT / "dist" / "Salpakan.exe"
process = subprocess.run([str(game), "--self-test"], stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, timeout=480, encoding="utf-8")
print("Windows EXE self-test", process.stdout, flush=True)
process.check_returncode()
report = json.loads(process.stdout)
assert report["done"] and report["externalResources"] == []
assert [row["mode"] for row in report["matches"]] == ["easy", "medium", "hard", "two players"]
assert all(row["plies"] >= 5 and row["result"].endswith("wins") for row in report["matches"])
