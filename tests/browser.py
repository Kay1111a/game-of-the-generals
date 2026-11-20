"""Play through the public interface. No access to the running match's private state."""
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
results, errors = [], []
SEED = """Math.random = (() => { let s = 3; return () => ((s = (Math.imul(s,1664525)+1013904223) >>> 0) / 2**32); })();"""
RANKS = ["5-Star General", "4-Star General", "3-Star General", "2-Star General", "1-Star General",
         "Colonel", "Lieutenant Colonel", "Major", "Captain", "1st Lieutenant", "2nd Lieutenant",
         "Sergeant", "Private", "Spy", "Flag"]
IDS = ["g5","g4","g3","g2","g1","col","ltc","maj","cpt","lt1","lt2","sgt","pvt","spy","flag"]
RANK_ID = dict(zip(RANKS, IDS))


def log(name, **values):
    results.append(dict(check=name, **values))
    print(name, json.dumps(values), flush=True)


def open_game(browser, rel, width=1160, height=900, mobile=False):
    context = browser.new_context(viewport={"width": width, "height": height}, has_touch=mobile,
                                  is_mobile=mobile, reduced_motion="reduce")
    context.add_init_script(SEED)
    page = context.new_page()
    page.set_default_timeout(7000)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("request", lambda req: errors.append("Unexpected external request: " + req.url)
            if req.url.startswith(("https:", "http:")) else None)
    page.goto((ROOT / rel).as_uri())
    expect(page.locator(".cell")).to_have_count(72)
    expect(page.locator(".piece")).to_have_count(21)
    expect(page.locator("#phase-heading")).to_have_text("Set your formation")
    return context, page


def btn(p, name):
    return p.get_by_role("button", name=name, exact=True)


def cell(p, n):
    return p.locator(f'[data-cell="{n}"]')


def select_match(p, mode, first="ivory", reveals=False):
    btn(p, "New match").click()
    p.get_by_role("radio", name=mode).check()
    p.locator("#first").select_option(first)
    p.locator("#open-ranks").set_checked(reveals)
    btn(p, "Start match").click()


def pass_to(p, side, touch=False):
    expect(p.locator(".cell")).to_have_count(0)
    expect(p.locator(".piece")).to_have_count(0)
    expect(p.locator("#phase-heading")).to_have_text("Board concealed")
    control = btn(p, "Reveal " + side + " board")
    control.tap() if touch else control.click()
    expect(p.locator(".cell")).to_have_count(72)


def place(p, side, name, target):
    own = p.get_by_role("button", name=re.compile(r"^[A-I][1-8], " + side + " " + name + "$")).first
    i = int(own.get_attribute("data-cell"))
    if i != target:
        cell(p, i).click()
        cell(p, target).click()
    expect(cell(p,target)).to_have_attribute("aria-label", re.compile(name + "$"))


def move(p, a, b):
    cell(p,a).click()
    expect(cell(p,b)).to_have_class(re.compile(r"\blegal\b"))
    cell(p,b).click()


def hotseat(browser):
    ctx,p=open_game(browser, "index.html", 390, 844, True)
    btn(p,"Rules & ranks").tap()
    expect(p.locator("#ranks-list li")).to_have_count(15)
    btn(p,"Back to board").tap()
    select_match(p,"Two players", reveals=True)
    pass_to(p,"Ivory",True)
    place(p,"Ivory","Flag",18)
    btn(p,"Lock formation").tap()
    pass_to(p,"Pine",True)
    assert p.locator(".cell").first.get_attribute("data-cell") == "8"
    place(p,"Pine","Flag",45)
    place(p,"Pine","Sergeant",53)
    btn(p,"Lock formation").tap()
    pass_to(p,"Ivory",True)
    expect(p.locator(".piece.back")).to_have_count(21)
    assert all("concealed piece" in label for label in p.locator(".cell:has(.back)").evaluate_all(
        "(cells) => cells.map(c => c.getAttribute('aria-label'))"))
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    p.screenshot(path=str(OUT/"phone-board.png"),full_page=True)
    # Declining must return the turn and hide the board during both handoffs.
    btn(p,"Offer draw").tap()
    expect(p.locator(".piece")).to_have_count(0)
    btn(p,"Decline draw").tap()
    pass_to(p,"Ivory",True)
    expect(p.locator("#phase-heading")).to_have_text("Ivory to move")
    for side,a,b in [("Ivory",18,27),("Pine",53,44),("Ivory",27,36),("Pine",44,53),("Ivory",36,45)]:
        move(p,a,b)
        if b!=45:
            pass_to(p,"Pine" if side=="Ivory" else "Ivory",True)
    expect(p.locator(".curtain")).to_contain_text("Ivory Flag against Pine Flag")
    expect(p.locator(".piece")).to_have_count(0)
    btn(p,"Conceal ranks & continue").click()
    expect(p.locator("#phase-heading")).to_have_text("Ivory wins")
    expect(p.locator("#guidance")).to_contain_text("Flag was captured")
    expect(p.locator(".log-list li")).to_have_count(5)
    p.screenshot(path=str(OUT/"hotseat-result.png"))
    btn(p,"Play again").tap()
    pass_to(p,"Ivory",True)
    expect(p.locator(".piece")).to_have_count(21)
    expect(p.locator(".log-list li")).to_have_count(0)
    btn(p,"Lock formation").tap()
    pass_to(p,"Pine",True)
    btn(p,"Lock formation").tap()
    pass_to(p,"Ivory",True)
    btn(p,"Offer draw").tap()
    btn(p,"Accept draw").tap()
    expect(p.locator("#phase-heading")).to_have_text("Match drawn")
    log("Two players, concealed handoffs, rotated board, draw declined and accepted, replay and Flag-on-Flag victory", plies=5, viewport="390x844")
    ctx.close()


def breakthroughs(browser):
    ctx,p=open_game(browser,"dist/Salpakan.html")
    for intercept in (False,True):
        select_match(p,"Two players")
        pass_to(p,"Ivory")
        place(p,"Ivory","Flag",18)
        btn(p,"Lock formation").click()
        pass_to(p,"Pine")
        place(p,"Pine","Sergeant",64)
        place(p,"Pine","Colonel",53)
        # Clear file A by making ordinary, legal formation swaps on Pine's screen.
        lane={45,54,63}
        for source in sorted(lane):
            if cell(p,source).locator(".piece").count():
                board=public_position(p)
                dest=next(n for n in range(45,72) if n not in lane and board[n] is None)
                cell(p,source).click()
                cell(p,dest).click()
        btn(p,"Lock formation").click()
        pass_to(p,"Ivory")
        for turn,source in enumerate((18,27,36,45,54)):
            move(p,source,source+9)
            pass_to(p,"Pine")
            if source!=54:
                a,b=(53,44) if turn%2==0 else (44,53)
                move(p,a,b)
                pass_to(p,"Ivory")
        # Pine still gets exactly one turn. Its screen conceals the identity of A8.
        expect(cell(p,63)).to_have_attribute("aria-label","A8, Ivory concealed piece")
        expect(p.locator("#phase-heading")).to_have_text("Pine to move")
        move(p,64,63) if intercept else move(p,53,44)
        expect(p.locator("#phase-heading")).to_have_text("Pine wins" if intercept else "Ivory wins")
        reason=p.locator("#guidance").inner_text()
        assert ("captured" if intercept else "far row") in reason
        log("Contested breakthrough "+("intercepted" if intercept else "survived"),plies=10,reason=reason)
    ctx.close()


def public_position(p):
    labels=p.locator("[data-cell]").evaluate_all("(cells)=>cells.map(c=>[Number(c.dataset.cell),c.getAttribute('aria-label')])")
    board=[None]*72
    for i, label in labels:
        desc=label.split(", ",1)[1]
        if desc == "empty":
            continue
        side,title=desc.split(" ",1)
        board[i]={"side":side.lower(), "rank": None if title=="concealed piece" else RANK_ID[title]}
    return board


def index(coord):
    return ord(coord[0])-ord("A")+(int(coord[1:])-1)*9


def log_events(p):
    rows=p.locator(".log-list li").evaluate_all("(rows)=>rows.map(r=>[r.querySelector('b').textContent,r.querySelector('small').textContent]).reverse()")
    codes={"Moved":"quiet","Attacker holds":"attack","Defender holds":"defend","Both removed":"both"}
    for coords,info in rows:
        a,b=coords.split(" → ")
        side,verdict=info.split(" · ")
        yield {"from":index(a),"to":index(b),"side":side.lower(),"verdict":codes[verdict]}


def solo(browser):
    ctx,p=open_game(browser,"dist/Salpakan.html")
    p.screenshot(path=str(OUT/"desktop-deployment.png"))
    btn(p,"Lock formation").click()
    expect(p.locator(".piece.back")).to_have_count(21)
    ranks={i:t["rank"] for i,t in enumerate(public_position(p)) if t and t["side"]=="ivory"}
    history=[]
    btn(p,"Offer draw").click()
    expect(p.locator("#guidance")).to_contain_text("computer declined")
    for turn in range(400):
        expect(p.locator("#phase-heading")).not_to_have_text("Computer’s turn")
        if btn(p,"Play again").count():
            break
        expect(p.locator("#phase-heading")).to_have_text("Ivory to move")
        for e in list(log_events(p))[len(history):]:
            own_moves=e["side"]=="ivory"
            own_rank=ranks.get(e["from"] if own_moves else e["to"])
            if e["verdict"]!="quiet":
                assert own_rank
                e["ownRank"]=own_rank
            if own_moves:
                del ranks[e["from"]]
                if e["verdict"] in ("quiet","attack"):
                    ranks[e["to"]]=own_rank
            elif e["verdict"] in ("both","attack"):
                ranks.pop(e["to"],None)
            history.append(e)
        view={"side":"ivory","turn":"ivory","phase":"play","board":public_position(p),"history":history}
        # Ivory's driver sees only the board labels and log available to a human.
        action=p.evaluate("""v=>SalpakanAI.chooseMove(v,()=>0.43)""", view)
        move(p,action["from"],action["to"])
    expect(btn(p,"Play again")).to_be_visible()
    plies=p.locator(".log-list li").count()
    assert plies>5
    result=p.locator("#phase-heading").inner_text()
    reason=p.locator("#guidance").inner_text()
    assert result in ("Ivory wins","Pine wins")
    assert "Flag" in reason
    p.screenshot(path=str(OUT/"solo-result.png"),full_page=True)
    btn(p,"Play again").click()
    expect(p.locator(".piece")).to_have_count(21)
    expect(p.locator(".log-list li")).to_have_count(0)
    log("Offline single-file solo match through completion and replay",plies=plies,outcome=result,reason=reason)
    ctx.close()


def keyboard(browser):
    ctx,p=open_game(browser,"dist/Salpakan.html",360,740)
    c=cell(p,18);c.focus()
    p.keyboard.press("ArrowRight");expect(cell(p,19)).to_be_focused()
    p.keyboard.press("ArrowUp");expect(cell(p,28)).to_be_focused()
    piece=p.get_by_role("button",name=re.compile(r"^[A-I][1-8], Ivory ")).first
    piece.focus()
    p.keyboard.press("Space")
    expect(piece).to_have_attribute("aria-pressed","true")
    p.keyboard.press("Escape")
    expect(piece).to_have_attribute("aria-pressed","false")
    btn(p,"Shuffle").click()
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    select_match(p,"Vs computer",first="pine")
    btn(p,"Lock formation").click()
    expect(p.locator("#phase-heading")).to_have_text("Ivory to move")
    expect(p.locator(".log-list li")).to_have_count(1)
    btn(p,"Resign").click();btn(p,"Keep playing").click()
    expect(p.locator("#phase-heading")).to_have_text("Ivory to move")
    btn(p,"Resign").click();btn(p,"Resign match").click()
    expect(p.locator("#phase-heading")).to_have_text("Pine wins")
    log("Keyboard arrows, shuffle, 360px layout, computer opens, resignation and cancellation")
    ctx.close()


if __name__=="__main__":
    # The copy played on Windows must be byte-identical to the one distributed on Linux.
    assert b"\r" not in (ROOT/"dist/Salpakan.html").read_bytes(), "Noncanonical line endings in the portable build"
    with sync_playwright() as pw:
        launch={"executable_path":os.environ["CHROMIUM_PATH"]} if "CHROMIUM_PATH" in os.environ else {}
        browser=pw.chromium.launch(**launch)
        print("Chromium",browser.version,flush=True)
        try:
            hotseat(browser)
            breakthroughs(browser)
            solo(browser)
            keyboard(browser)
            assert not errors,errors
            log("Browser error and external HTTP request checks",errors=errors)
            (OUT/"playthroughs.json").write_text(json.dumps(results,indent=2))
        finally:
            browser.close()
