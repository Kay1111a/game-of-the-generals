"""Launch the delivered EXE and exercise its embedded WebView2 window."""
import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
endpoint = f"http://127.0.0.1:{port}"
env = dict(os.environ, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f"--remote-debugging-port={port} --remote-debugging-address=127.0.0.1")
process = subprocess.Popen([str(ROOT/"dist/Salpakan.exe")], env=env)
try:
    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError(f"EXE exited at startup: {process.returncode}")
        try:
            with urllib.request.urlopen(endpoint+"/json/version",timeout=1) as reply:
                if json.load(reply).get("webSocketDebuggerUrl"):
                    break
        except OSError:
            time.sleep(.5)
    else:
        raise RuntimeError("The native game did not open its WebView2 window.")
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(endpoint)
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.wait_for_event("page")
        page.wait_for_selector(".cell")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.emulate_media(reduced_motion="reduce")
        context.set_offline(True)
        page.get_by_role("button",name="New match",exact=True).click()
        page.get_by_role("button",name="Close settings").click()
        script = (ROOT/"tests/native/play.js").read_text(encoding="utf-8")
        page.evaluate(script+"\nvoid playNativeMatches()")
        page.wait_for_function("window.nativePlaytest?.done || window.nativePlaytest?.error",timeout=420000)
        report=page.evaluate("window.nativePlaytest")
        assert report.get("done") and not errors,(report,errors)
        print("Windows EXE WebView2",browser.version,"offline games",json.dumps(report["matches"]),flush=True)
        assert len(report["matches"])==4
finally:
    if process.poll() is None:
        subprocess.run(["taskkill","/PID",str(process.pid),"/T","/F"],check=False)
