"""이미지 스튜디오 (11/2) — 내 맥에서 클릭으로 그림 만들기·학습. 계산은 Modal GPU, 화면만 로컬.

  tooling/image/.venv/bin/python tooling/image/studio.py     # → http://localhost:7860

목록(그림체·포즈·상황)은 studio_presets.json — 매번 다시 읽으니 파일만 고치고 화면에서 '목록 새로고침'.
생성은 배포된 Modal 앱 miro-lora-test 의 Gen 을 부른다(처음 한 번: modal deploy tooling/image/modal_lora_test.py).
API 키를 쓰지 않는다 — ~/.modal.toml 의 Modal 로그인만.
"""
import datetime, json, os, subprocess, sys
from pathlib import Path

import gradio as gr
import modal

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
PRESETS = HERE / 'studio_presets.json'
OUT = ROOT / 'output' / 'studio'
LOGS = ROOT / 'output' / 'studio' / 'logs'
# 어려 보이는 그림 차단 — 목록·화면에서 못 끈다(서버 NEGATIVE_BASE 에도 child·loli·young·flat chest 고정).
MINOR_BLOCK = 'child, loli, shota, young, flat chest, petite child, underage'


def presets():
    return json.loads(PRESETS.read_text(encoding='utf-8'))


def choices(group):
    return [(s['label'], s['id']) for s in presets()['situations'] if s['group'] == group]   # 화면엔 이름만, 값은 id


def style_choices():
    return [(v['label'], k) for k, v in presets()['styles'].items()]


def comp_choices(group):
    return [o['label'] for o in presets()['compositions'][group]]


def apply_comp(prompt, picks):
    """구도(거리·각도·시선): '자동'이 아니면 그 묶음의 다른 구도 태그를 장면 문장에서 빼고 고른 것을 넣는다."""
    tags = [t.strip() for t in prompt.split(',') if t.strip()]
    add = []
    for group, label in picks.items():
        opts = presets()['compositions'][group]
        chosen = next((o for o in opts if o['label'] == label), None)
        if not chosen or not chosen['tags']:
            continue
        known = {t.strip() for o in opts for t in o['tags'].split(',') if t.strip()}
        tags = [t for t in tags if t not in known]
        add.append(chosen['tags'])
    return ', '.join(tags + add)


def build(style, sit, character, picks):
    parts = [style['subject'], style['partner'] + ', hetero' if sit['couple'] else 'solo', character.strip(), style['body'],
             apply_comp(sit['prompt'], picks)]
    return ', '.join(p for p in parts if p)


def generate(style_key, daily, unveil_sel, character, c_dist, c_angle, c_gaze, seeds, progress=gr.Progress()):
    picks = {'거리': c_dist, '각도': c_angle, '시선': c_gaze}
    p = presets()
    style = p['styles'][style_key]
    by_id = {s['id']: s for s in p['situations']}
    picked = [by_id[x] for x in (daily or []) + (unveil_sel or []) if x in by_id]
    if not picked:
        raise gr.Error('포즈·상황을 하나 이상 고르세요')
    raw = seeds if isinstance(seeds, list) else str(seeds).split(',')
    seed_list = [int(s) for s in (str(x).strip() for x in raw) if s.isdigit()] or [11]
    jobs = [(sit, s) for sit in picked for s in seed_list]   # 선택 하나 × 시드 하나 = 한 장
    gen = modal.Cls.from_name('miro-lora-test', 'Gen')(ckpt=style['ckpt'])
    neg = ', '.join(x for x in [style['neg'], MINOR_BLOCK] if x)
    args = [(build(style, sit, character, picks), style['variant'], style['scale'], s, neg, sit['group'] == '언베일', True,
             style['hr_scale'], style['hr_strength']) for sit, s in jobs]
    day = OUT / datetime.date.today().isoformat()
    day.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime('%H%M%S')
    gallery = []
    progress(0, desc=f'{len(jobs)}장 생성 중 (첫 장은 GPU 준비로 1~2분)')
    for n, data in enumerate(gen.gen.starmap(args), 1):   # 결과를 끝까지 읽는다(zip 으로 끊으면 modal 이 aclose 경고)
        sit, s = jobs[n - 1]
        path = day / f'{stamp}-{style_key}-{sit["id"]}-s{s}.png'
        path.write_bytes(data)
        gallery.append((str(path), f"{sit['label']} · 그림 번호 {s}"))
        progress(n / len(jobs), desc=f'{n}/{len(jobs)}장')
    return gallery, f'{len(gallery)}장 저장: {day}'


def refresh():
    return (gr.update(choices=style_choices()), gr.update(choices=choices('일상'), value=[]), gr.update(choices=choices('언베일'), value=[]),
            *[gr.update(choices=comp_choices(g), value=comp_choices(g)[0]) for g in ('거리', '각도', '시선')])


# ---------- 학습 ----------
def runs():
    os.environ.setdefault('LORA_RUN', 'siran')
    sys.path.insert(0, str(HERE))
    import importlib, lora_train
    importlib.reload(lora_train)
    return lora_train.RUNS


def run_info(name):
    r = runs().get(name)
    if not r:
        return ''
    sets = ', '.join(f'{k} → "{v}"' for k, v in r['sets'].items())
    return f"결과 파일: {r['name']}.safetensors\n그림체(폴더 → 트리거): {sets}\n스텝 {r['steps']}, 비용 상한 ${r['cap']}"


def start(name, with_tag):
    LOGS.mkdir(parents=True, exist_ok=True)
    log = LOGS / f'train-{name}-{datetime.datetime.now():%m%d-%H%M}.log'
    cmd = ['modal', 'run', '--detach', str(HERE / 'modal_lora.py') + '::train', '--run-name', name] + (['--with-tag'] if with_tag else [])
    subprocess.Popen(cmd, cwd=ROOT, stdout=open(log, 'w'), stderr=subprocess.STDOUT)
    return f'시작했습니다(클라우드에서 계속 돕니다, 창을 닫아도 됨). 로그: {log}'


def status(name):
    suf = '' if name == 'siran' else f'-{name}'
    def sh(*a):
        return subprocess.run(a, cwd=ROOT, capture_output=True, text=True).stdout
    budget = sh('modal', 'volume', 'get', 'miro-image-train', f'/siran/budget{suf}.json', '-').split('✓')[0].strip() or '(아직 없음)'
    files = [l for l in sh('modal', 'volume', 'ls', 'miro-image-train', f'/siran/out{suf}').splitlines() if l.endswith('.safetensors')]
    return f"누적 비용: {budget}\n저장된 파일:\n" + ('\n'.join(sorted(files)) or '(아직 없음)')


def upload(folder):
    folder = Path(folder.strip()).expanduser()
    if not folder.is_dir():
        raise gr.Error('폴더 경로가 아닙니다')
    r = subprocess.run(['modal', 'volume', 'put', 'miro-image-train', str(folder), f'/siran/raw/{folder.name}'], capture_output=True, text=True)
    return (r.stdout + r.stderr)[-400:] + f'\n\n올린 폴더 이름: {folder.name} — 이 폴더로 학습하려면 Claude 에게 "{folder.name} 학습 묶음 추가해줘"라고 하세요.'


# ---------- 글씨 넣기 (comic.py) ----------
KINDS = {'말풍선': 'bubble', '외침': 'shout', '효과음': 'sfx', '작은글씨': 'small', '놀람선': 'marks', '제목': 'title', '확대창': 'inset'}
COMIC_COLS = ['종류', '글씨', '가로%', '세로%', '크기', '기울기', '꼬리 가로%', '꼬리 세로%', '색']
COMIC_EXAMPLE = [['말풍선', '좋다아..♥', 70, 15, 40, 0, 62, 28, ''], ['효과음', '움찔♥', 20, 75, 90, 12, '', '', ''],
                 ['작은글씨', '으응..', 45, 40, 52, -10, '', '', ''], ['놀람선', '', 50, 22, 40, 0, '', '', '']]


def make_comic(files, layout, rows):
    import comic
    paths = [f if isinstance(f, str) else f.name for f in (files or [])]
    if not paths:
        raise gr.Error('그림을 하나 이상 올리세요')
    n_panels = 2 if layout != '1' else 1
    layers = []
    for r in rows or []:
        r = (list(r) + [''] * 9)[:9]
        kind, text, x, y, size, angle, tx, ty, color = [str(v).strip() for v in r]
        if kind not in KINDS or x == '' or y == '':
            continue
        L = {'type': KINDS[kind], 'x': float(x), 'y': float(y)}
        if size:
            L['size'] = float(size)
        if angle:
            L['angle'] = float(angle)
        if color:
            L['color'] = color
        if tx and ty:
            L['tail'] = [float(tx), float(ty)]
        if L['type'] == 'inset':   # 확대창: 글씨 칸 = 올린 그림 번호, 크기 칸 = 창 너비 %
            w = L.pop('size', 28)
            L.update(src=paths[int(text or n_panels + 1) - 1], w=w, h=w)
            if 'tail' in L:   # 확대창의 꼬리 칸 = 확대할 지점(그 그림의 %)
                L['focus'] = L.pop('tail')
        elif L['type'] == 'title':   # 제목: "무상천마검|無上天魔劍" 처럼 | 뒤가 부제
            L['text'], _, L['sub'] = text.partition('|')
        else:
            L['text'] = text.replace('\\n', '\n')
        if L['type'] == 'sfx' and text.startswith('|'):   # 효과음 "|쯔윽" = 세로 쓰기
            L['text'], L['vertical'] = text[1:], True
        layers.append(L)
    day = OUT / datetime.date.today().isoformat()
    day.mkdir(parents=True, exist_ok=True)
    path = day / f'{datetime.datetime.now():%H%M%S}-comic.png'
    comic.render(paths[:n_panels], layout, layers).save(path)
    return str(path), f'저장: {path}'


# 디자인: 피클(pickle.com) 참고 — 흰 바탕·검은 글자·Apple 서체, 작은 파란 소제목 + 큰 굵은 제목, 검은 알약 주 버튼·연회색 알약 보조, 넉넉한 여백.
THEME = gr.themes.Base(
    font=['-apple-system', 'SF Pro Display', 'Apple SD Gothic Neo', 'Helvetica Neue', 'sans-serif'],
    radius_size=gr.themes.sizes.radius_lg,
).set(
    body_background_fill='#ffffff', body_text_color='#000000', background_fill_primary='#ffffff', background_fill_secondary='#ffffff',
    block_border_width='0px', block_shadow='none', block_background_fill='#ffffff', block_label_text_color='#000000',
    block_title_text_weight='600', input_background_fill='#f4f4f5', input_border_width='0px', input_radius='16px',
    button_primary_background_fill='#000000', button_primary_background_fill_hover='#222222', button_primary_text_color='#ffffff',
    button_secondary_background_fill='#f2f2f4', button_secondary_background_fill_hover='#e8e8eb', button_secondary_text_color='#000000',
    button_large_radius='90px', button_small_radius='90px', button_border_width='0px', color_accent_soft='#f2f2f4',
)
CSS = '''
.gradio-container { max-width: 980px !important; margin: 0 auto !important; padding: 48px 20px 80px !important; }
footer { display: none !important; }
.hero { text-align: center; margin-bottom: 28px; }
.hero .eyebrow { color: #1a73e8; font-size: 15px; font-weight: 500; margin-bottom: 10px; }
.hero h1 { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; margin: 0 0 12px; }
.hero p { color: #6b6b70; font-size: 16px; margin: 0; }
.tabs > .tab-nav, [role="tablist"] { justify-content: center; border: 0 !important; gap: 8px; margin-bottom: 24px; }
[role="tab"] { border-radius: 90px !important; padding: 10px 22px !important; background: #f2f2f4 !important; border: 0 !important; font-weight: 600; }
[role="tab"][aria-selected="true"] { background: #000 !important; color: #fff !important; }
.card { background: #f7f7f8 !important; border-radius: 28px !important; padding: 20px !important; margin-bottom: 16px; border: 0 !important; }
.card > div, .card .block, .card .form { background: transparent !important; border: 0 !important; box-shadow: none !important; }
.card textarea, .card input[type="text"] { background: #ffffff !important; }
.pills .wrap { gap: 8px !important; }
.pills label { background: #ffffff !important; border: 1px solid #e6e6e9 !important; border-radius: 90px !important; padding: 9px 16px !important;
  font-weight: 500; box-shadow: none !important; transition: all .15s; }
.pills label.selected, .pills label:has(input:checked) { background: #000 !important; color: #fff !important; border-color: #000 !important; }
.pills input { display: none !important; }
.go button, button.go { height: 56px; font-size: 17px; font-weight: 700; }
.gallery-card .grid-wrap, .gallery-card img { border-radius: 20px !important; }
.hint { color: #8a8a90; font-size: 14px; }
'''

with gr.Blocks(title='미로 이미지 스튜디오') as app:
    gr.HTML('<div class="hero"><div class="eyebrow">미로 이미지 스튜디오</div><h1>그림체와 장면을 고르면<br>한 장씩 그려 드려요</h1>'
            '<p>선택 하나당 한 장 · 계산은 클라우드 GPU에서</p></div>')
    with gr.Tab('사진 만들기'):
        with gr.Group(elem_classes='card'):
            with gr.Row():
                style = gr.Radio(style_choices(), value='gda', label='그림체', elem_classes='pills')
                reload = gr.Button('목록 새로고침', scale=0, size='sm')
            character = gr.Textbox(label='인물 묘사 (영어 태그)', value='shoulder-length brown bob hair, grey eyes, thin silver-rimmed glasses')
        with gr.Group(elem_classes='card'):
            daily = gr.CheckboxGroup(choices('일상'), label='일상', elem_classes='pills')
            unveil = gr.CheckboxGroup(choices('언베일'), label='언베일', elem_classes='pills')
        with gr.Group(elem_classes='card'):
            gr.Markdown('**구도** — 고른 장면 모두에 같이 적용돼요. "자동"이면 장면마다 정해 둔 기본 구도로 그려요.')
            with gr.Row():
                c_dist = gr.Dropdown(comp_choices('거리'), value=comp_choices('거리')[0], label='얼마나 가까이')
                c_angle = gr.Dropdown(comp_choices('각도'), value=comp_choices('각도')[0], label='어느 방향에서')
                c_gaze = gr.Dropdown(comp_choices('시선'), value=comp_choices('시선')[0], label='어디를 보는지')
        with gr.Group(elem_classes='card'):
            seeds = gr.Dropdown(['11', '23', '37', '41', '7', '58', '72', '99'], value=['11'], multiselect=True, allow_custom_value=True,
                                label='그림 번호',
                                info='번호마다 같은 장면도 구도·표정이 다르게 그려져요. 같은 번호면 같은 그림이 다시 나와요. '
                                     '여러 개 고르면 장면마다 그 수만큼 나와요. 목록에 없는 번호는 직접 입력해도 돼요.')
        go = gr.Button('생성하기', variant='primary', elem_classes='go')
        msg = gr.Markdown(elem_classes='hint')
        gallery = gr.Gallery(label='결과', columns=3, height='auto', elem_classes='gallery-card')
        go.click(generate, [style, daily, unveil, character, c_dist, c_angle, c_gaze, seeds], [gallery, msg])
        reload.click(refresh, None, [style, daily, unveil, c_dist, c_angle, c_gaze])
    with gr.Tab('글씨 넣기'):
        gr.Markdown('그림 위에 만화처럼 말풍선·효과음·제목을 얹어요. 위치는 그림의 % (왼쪽 위가 0, 오른쪽 아래가 100).  \n'
                    '종류: 말풍선 · 외침(뾰족) · 효과음 · 작은글씨 · 놀람선 · 제목 · 확대창  \n'
                    '효과음 글씨를 `|쯔윽` 처럼 쓰면 세로 · 제목은 `무상천마검|無上天魔劍` 처럼 | 뒤가 한자 부제 · '
                    '확대창은 글씨 칸에 올린 그림 번호, 크기 칸에 창 크기(%), 꼬리 칸에 확대할 지점(%) · 줄바꿈은 `\\n`', elem_classes='hint')
        with gr.Group(elem_classes='card'):
            c_files = gr.File(label='그림 (1장, 2칸이면 2장, 확대창용은 그 뒤에)', file_count='multiple', file_types=['image'])
            c_layout = gr.Radio([('한 장', '1'), ('좌우 2칸', 'h2'), ('위아래 2칸', 'v2')], value='1', label='칸', elem_classes='pills')
        with gr.Group(elem_classes='card'):
            c_rows = gr.Dataframe(value=COMIC_EXAMPLE, headers=COMIC_COLS, column_count=(9, 'fixed'), row_count=(4, 'dynamic'),
                                  type='array', label='넣을 글씨 (줄 추가 가능)')
        c_go = gr.Button('글씨 넣기', variant='primary', elem_classes='go')
        c_msg = gr.Markdown(elem_classes='hint')
        c_out = gr.Image(label='결과', type='filepath')
        c_go.click(make_comic, [c_files, c_layout, c_rows], [c_out, c_msg])
    with gr.Tab('학습'):
        gr.Markdown('학습 묶음(데이터 폴더·트리거·비용 상한)은 `lora_train.py` 의 RUNS — 새 묶음은 Claude 에게 요청하세요.', elem_classes='hint')
        with gr.Group(elem_classes='card'):
            with gr.Row():
                folder = gr.Textbox(label='데이터 폴더 올리기 (맥의 폴더 경로)', placeholder='/Users/.../output/lora-data/남성향/가다공-P')
                up = gr.Button('올리기', scale=0)
            up_out = gr.Textbox(label='올리기 결과', lines=3)
        up.click(upload, folder, up_out)
        with gr.Group(elem_classes='card'):
            run = gr.Dropdown(list(runs()), label='학습 묶음', value='gda3')
            info = gr.Textbox(label='묶음 정보', lines=3, value=run_info('gda3'))
            with_tag = gr.Checkbox(label='태깅부터 다시 (새 데이터일 때)', value=False)
        run.change(run_info, run, info)
        with gr.Row():
            b_start = gr.Button('학습 시작', variant='primary', elem_classes='go')
            b_status = gr.Button('상태 보기', elem_classes='go')
        out = gr.Textbox(label='결과', lines=10)
        b_start.click(start, [run, with_tag], out)
        b_status.click(status, run, out)

if __name__ == '__main__':
    # 맥이 다크 모드여도 피클처럼 항상 밝은 화면(Gradio 는 시스템 설정을 따라 body 에 dark 를 붙인다)
    LIGHT = "() => { const k = () => { document.body.classList.remove('dark'); document.documentElement.classList.remove('dark'); }; k(); new MutationObserver(k).observe(document.body, {attributes: true}); }"
    app.launch(server_name='127.0.0.1', server_port=7860, inbrowser=True, theme=THEME, css=CSS, js=LIGHT)
