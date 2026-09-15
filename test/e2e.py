"""E2E in headless Chromium. Run: python3 test/e2e.py  (starts a local http server itself)"""
import subprocess, time, os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765; BASE = f'http://127.0.0.1:{PORT}/'
SHOTS = '/tmp/shots'; os.makedirs(SHOTS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
fails = 0
def check(cond, msg):
    global fails
    print(('ok: ' if cond else 'FAIL: ') + msg)
    if not cond: fails += 1
def attach(pg, tag):
    pg.on('console', lambda m: errors.append(f'[{tag}] {m.type}: {m.text}') if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))
def shot(pg, name): pg.screenshot(path=f'{SHOTS}/{name}.png')
def dismiss(pg):
    for _ in range(3):
        if pg.locator('.scrim.center.open .modal .btn').count(): pg.click('.scrim.center.open .modal .btn >> nth=0'); time.sleep(0.3)
        else: break
def onboard(pg, name):
    pg.wait_for_selector('.onboard .input', timeout=8000)
    pg.fill('.onboard .input', name); pg.click('.onboard .btn.primary'); pg.wait_for_selector('.home', timeout=5000)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ja-JP')
        ctx.route('**/*', lambda route: route.continue_() if '127.0.0.1' in route.request.url else route.abort())  # sandbox has no internet: fail fast
        A = ctx.new_page(); attach(A, 'A')
        A.goto(BASE + '?net=bc'); onboard(A, 'けんけん'); shot(A, '01_home')
        check(A.locator('.pc-name').inner_text() == 'けんけん', 'onboarding saved name')
        # ---- solo ----
        A.click('.ticket.solo'); A.wait_for_selector('.sheet'); A.click('.sheet .seg >> nth=0 >> button >> nth=0')  # 5問
        shot(A, '02_solo_setup'); A.click('.sheet .btn.primary'); A.wait_for_selector('.countdown', timeout=4000); shot(A, '03_countdown')
        A.wait_for_selector('.game.speed .choice', timeout=8000); shot(A, '04_question')
        ok_count = 0
        for i in range(5):
            A.wait_for_selector('.game.speed .choice:not(:disabled)', timeout=15000)
            # open a hint on first question to test
            if i == 0 and A.locator('.hint:not(.open)').count(): A.click('.hint:not(.open) >> nth=0'); A.wait_for_selector('.hint.open', timeout=2000); shot(A, '05_hint_open')
            # answer: read correct id? not visible; pick first choice
            A.click('.choice >> nth=0')
            A.wait_for_selector('.reveal', timeout=6000)
            if i == 0: shot(A, '06_reveal')
            if A.locator('.choice.correct.picked').count() or A.locator('.reveal.ok').count(): ok_count += 1
            if A.locator('.reveal .btn.primary').count(): A.click('.reveal .btn.primary')
            else: time.sleep(3)
        A.wait_for_selector('.result', timeout=10000); shot(A, '07_result_solo')
        check(A.locator('.result .rrow').count() == 5, 'result lists 5 rounds')
        st = A.evaluate('KM.Store.state.stats.q'); check(st == 5, f'5 answers recorded (q={st})')
        time.sleep(1.2); dismiss(A); A.click('.result .actions .btn:not(.rematch)'); A.wait_for_selector('.home', timeout=5000)
        # ---- codex / record ----
        A.click('#tabbar .tab >> nth=2'); A.wait_for_selector('.codex'); shot(A, '08_codex')
        A.click('.sticker >> nth=0'); A.wait_for_selector('.sheet .country', timeout=4000); shot(A, '09_country'); A.click('.sheet-head .iconbtn'); time.sleep(0.3)
        A.click('#tabbar .tab >> nth=3'); A.wait_for_selector('.record'); shot(A, '10_record')
        stock_n = A.evaluate('KM.Store.stockList().length'); print('stock after solo:', stock_n)
        if stock_n:
            A.click('#tabbar .tab >> nth=0'); A.wait_for_selector('.home'); A.click('.ticket.review'); A.wait_for_selector('.game.speed .choice', timeout=12000); shot(A, '11_review'); A.evaluate('KM.App.backHome()'); A.wait_for_selector('.home')
        # ---- VS speed (two pages, BroadcastChannel) ----
        A.click('#tabbar .tab >> nth=1'); A.wait_for_selector('.vs'); shot(A, '12_vs')
        A.click('.vs .card >> nth=0 >> .btn.primary'); A.wait_for_selector('.bigcode', timeout=8000)
        code = A.locator('.bigcode').inner_text().strip(); print('room code', code); shot(A, '13_lobby_host')
        B = ctx.new_page(); attach(B, 'B'); B.goto(BASE + '?net=bc&room=' + code)
        # second page shares localStorage (same origin) -> profile exists; it auto-joins
        B.wait_for_selector('.lobby', timeout=8000); B.wait_for_selector('.btn.primary.big:not([disabled])', timeout=8000); shot(B, '14_lobby_guest')
        A.wait_for_selector('.players .pl.rival', timeout=5000); check(True, 'host sees guest')
        B.click('.btn.primary.big'); A.wait_for_selector('.btn.primary.big:not([disabled])', timeout=5000); shot(A, '15_lobby_ready')
        # set 10 questions default; kickoff
        A.click('.btn.primary.big'); A.wait_for_selector('.countdown', timeout=5000); B.wait_for_selector('.countdown', timeout=5000)
        A.wait_for_selector('.game.speed .choice', timeout=8000); B.wait_for_selector('.game.speed .choice', timeout=8000); shot(A, '16_vs_q_host'); shot(B, '17_vs_q_guest')
        for i in range(10):
            A.wait_for_selector('.game.speed .choice:not(:disabled)', timeout=15000); B.wait_for_selector('.game.speed .choice:not(:disabled)', timeout=15000)
            # guest answers first with the correct answer via engine peek on host (test only)
            correct = A.evaluate('KM.App.game.engine.q.cid')
            B.click(f'.choice[data-cid="{correct}"]')
            if i == 0: shot(B, '18_guest_answered')
            A.click('.choice >> nth=1')
            A.wait_for_selector('.reveal', timeout=6000); B.wait_for_selector('.reveal', timeout=6000)
            if i == 0: time.sleep(0.4); shot(A, '19_vs_reveal_host'); shot(B, '20_vs_reveal_guest')
            A.wait_for_selector('.reveal', state='detached', timeout=8000)
        A.wait_for_selector('.result', timeout=12000); B.wait_for_selector('.result', timeout=12000); shot(A, '21_vs_result_host'); shot(B, '22_vs_result_guest')
        gs = B.evaluate('KM.App.game.view.summary.players.find(p=>p.id==="guest").score'); hs = A.evaluate('KM.App.game.view.summary.players.find(p=>p.id==="host").score')
        check(gs > hs, f'guest (always correct & first) beats host: {gs} vs {hs}')
        check(B.locator('.verdict h1').inner_text().startswith('勝利'), 'guest sees 勝利')
        check(A.evaluate('KM.Store.state.stats.matches') >= 1, 'match recorded on host')
        # rematch request from guest
        time.sleep(1.2); dismiss(B); B.click('.btn.rematch'); time.sleep(0.4); check(A.locator('.btn.rematch.pulse').count() == 1, 'host sees rematch pulse')
        # back to room on both, switch to turn mode
        dismiss(A); A.click('.result .actions .btn:not(.rematch)'); dismiss(B); B.click('.result .actions .btn:not(.rematch)'); A.wait_for_selector('.lobby', timeout=5000); B.wait_for_selector('.lobby', timeout=5000)
        A.click('.settings .seg >> nth=0 >> button >> nth=1')  # mode -> turn
        A.wait_for_selector('text=🃏 出題バトル', timeout=4000); B.wait_for_selector('text=🃏 出題バトル', timeout=4000)
        A.click('.settings .seg >> nth=1 >> button >> nth=0')  # rounds 4
        B.click('.btn.primary.big'); A.wait_for_selector('.btn.primary.big:not([disabled])', timeout=5000); A.click('.btn.primary.big')
        A.wait_for_selector('.pick .hcard', timeout=6000); B.wait_for_selector('.wait', timeout=6000); shot(A, '23_turn_pick'); shot(B, '24_turn_wait')
        A.click('.hcard >> nth=0'); A.click('.pick .btn.primary'); B.wait_for_selector('.answer', timeout=6000); A.wait_for_selector('.asker', timeout=6000); shot(B, '25_turn_answer'); shot(A, '26_turn_asker')
        B.click('.hcard-n'); B.wait_for_selector('.hcard-o', timeout=4000); check(B.locator('.potential b').inner_text() == '90', 'hint reduces potential to 90')
        A.click('.rbtn >> nth=0'); time.sleep(0.5); check(B.locator('.rfloat').count() >= 1, 'reaction floats on answerer')
        target = A.evaluate('KM.App.game.engine.target')
        B.fill('.answer .input', 'ぶらじる'); B.wait_for_selector('.sitem', timeout=3000); B.click('.sitem >> nth=0'); B.click('.confirm .btn.primary')
        time.sleep(0.5)
        if B.locator('.treveal').count() == 0:
            check(B.locator('.gwrong').count() == 1, 'wrong guess listed')
            ja = A.evaluate(f'KM.Quiz.byId["{target}"].ja'); B.fill('.answer .input', ja); B.wait_for_selector('.sitem', timeout=3000); B.click('.sitem >> nth=0'); B.click('.confirm .btn.primary')
        B.wait_for_selector('.treveal.ok', timeout=5000); A.wait_for_selector('.treveal', timeout=5000); shot(B, '27_turn_reveal_guest'); shot(A, '28_turn_reveal_host')
        A.click('.treveal .btn.primary')
        # round 2: guest asks, host answers -> give up
        B.wait_for_selector('.pick .hcard', timeout=6000); A.wait_for_selector('.wait', timeout=6000)
        B.click('.hcard >> nth=1'); B.click('.pick .btn.primary'); A.wait_for_selector('.answer', timeout=6000)
        A.click('.btn.ghost'); A.wait_for_selector('.modal .btn.danger', timeout=3000); A.click('.modal .btn.danger'); A.wait_for_selector('.treveal.ng', timeout=5000); shot(A, '29_turn_giveup')
        A.click('.treveal .btn.primary')
        # rounds 3-4: quick
        for r in range(2):
            asker, answerer = (A, B) if r == 0 else (B, A)
            asker.wait_for_selector('.pick .hcard', timeout=8000); asker.click('.hcard >> nth=0'); asker.click('.pick .btn.primary'); answerer.wait_for_selector('.answer', timeout=6000)
            tgt = A.evaluate('KM.App.game.engine.target'); ja = A.evaluate(f'KM.Quiz.byId["{tgt}"].ja')
            answerer.fill('.answer .input', ja); answerer.wait_for_selector('.sitem', timeout=3000); answerer.click('.sitem >> nth=0'); answerer.click('.confirm .btn.primary'); A.wait_for_selector('.treveal', timeout=5000); A.click('.treveal .btn.primary')
        A.wait_for_selector('.result', timeout=10000); B.wait_for_selector('.result', timeout=10000); dismiss(A); dismiss(B); shot(A, '30_turn_result')
        check(A.evaluate('KM.Store.state.history.filter(x=>x.mode==="turn").length') == 2, 'host recorded 2 turn answers')
        # leave
        B.close()
        A.wait_for_selector('#toast.show', timeout=6000); check('退出' in A.locator('#toast').inner_text(), 'host notified of guest leaving'); shot(A, '31_after_drop')
        if A.locator('.modal').count(): A.click('.modal .btn.primary')
        # ---- hotseat ----
        A.evaluate('KM.App.leaveRoom()'); A.wait_for_selector('.vs', timeout=4000); A.click('.modecard >> nth=1'); A.wait_for_selector('.card.sub', timeout=4000); A.click('.card.sub .btn'); A.wait_for_selector('.sheet'); A.fill('.sheet .input', 'たろう'); A.click('.sheet .seg button >> nth=0'); A.click('.sheet .btn.primary')
        A.wait_for_selector('.handoff', timeout=5000); shot(A, '32_handoff'); A.click('.handoff .btn'); A.wait_for_selector('.pick .hcard', timeout=5000); A.click('.hcard >> nth=0'); A.click('.pick .btn.primary')
        A.wait_for_selector('.handoff', timeout=5000); A.click('.handoff .btn'); A.wait_for_selector('.answer', timeout=5000); shot(A, '33_hotseat_answer')
        tgt = A.evaluate('KM.App.game.engine.target'); ja = A.evaluate(f'KM.Quiz.byId["{tgt}"].ja')
        A.fill('.answer .input', ja); A.wait_for_selector('.sitem', timeout=3000); A.click('.sitem >> nth=0'); A.click('.confirm .btn.primary'); A.wait_for_selector('.treveal.ok', timeout=5000); check(True, 'hotseat round works')
        A.evaluate('KM.App.backHome()'); A.wait_for_selector('.home', timeout=5000); dismiss(A)
        # settings sheet
        A.click('.pcard'); A.wait_for_selector('.sheet .toggle', timeout=4000); shot(A, '34_settings'); A.click('.sheet-head .iconbtn')
        b.close()
finally:
    srv.terminate()
print('\nconsole errors:', len(errors)); [print(' ', e) for e in errors[:20]]
print('FAILS:', fails)
sys.exit(1 if (fails or errors) else 0)
