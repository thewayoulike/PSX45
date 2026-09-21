// Embedded during public-page rendering; no additional asset request.
export const publicVisualTheme = `
/* Approved public-page styling, embedded in generated HTML. */
:root { --bg:#f3f6f8; --card:#fff; --text:#172d3b; --muted:#4c6172; --line:#d9e2e8; --green:#047857; --blue:#087e99; }
:root[data-theme="dark"] { --bg:#0d1723; --card:#152334; --text:#edf3f8; --muted:#b7c8d7; --line:#2a3c4c; --green:#4bdbad; --blue:#61d1e8; }
:root body{background:var(--bg)!important;color:var(--text)!important}
:root header,:root footer{background:var(--card)!important}
:root .contents,:root .guide-list a{border-radius:11px;background:var(--card);box-shadow:0 2px 6px rgb(0 0 0 / .025)}
:root .button{border-radius:8px;font-weight:600}
:root h1{font-weight:700;letter-spacing:-1px}
:root h2{font-weight:650}
:root .eyebrow{letter-spacing:.08em;font-size:13px}
:root .sections p,:root .intro,:root .guide-list span{color:var(--muted)!important}
:root nav a{font-size:14px}
:root .dark-logo{display:none}:root[data-theme="dark"] .light-logo{display:none}:root[data-theme="dark"] .dark-logo{display:block}
@media(max-width:639px){:root main{padding-top:28px}:root .sections p{font-size:16px;line-height:1.75}}
/* Existing public-page structure and branding. */
:root { --bg:#e8eff3; --card:#fff; --text:#17394c; --muted:#496577; --line:#c5d6df; }
:root[data-theme="dark"] { --bg:#091c28; --card:#132f40; --text:#eaf5fc; --muted:#bed2de; --line:#355365; }
:root header { background:#102c3e !important; border-bottom:3px solid #069b79; }
:root header .light-logo { display:none !important; }
:root header .dark-logo { display:block !important; }
:root header :is(a,button) { color:#dff4fb; }
:root header .brand > span,
:root header .brand small { color:#68d3ec !important; }
:root header .brand b,
:root header .brand small i { color:#4ed5ab !important; }
:root .contents { border:1px solid var(--line); border-top:4px solid #039b75; border-radius:6px; box-shadow:none; }
:root .guide-list a { border:1px solid var(--line); border-left:3px solid #039b75; border-radius:6px; box-shadow:none; }
:root h1 { font-weight:650; color:var(--text); letter-spacing:-.035em; }
:root h2 { color:var(--text); font-weight:600; }
:root .button { border-radius:5px; }
:root footer { border-top:2px solid #c5d6df; }

@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) { --bg:#0d1723; --card:#152334; --text:#edf3f8; --muted:#b7c8d7; --line:#2a3c4c; --green:#4bdbad; --blue:#61d1e8; }
:root:not([data-theme="light"]) .light-logo{display:none}
:root:not([data-theme="light"]) .dark-logo{display:block}
:root:not([data-theme="light"]) { --bg:#091c28; --card:#132f40; --text:#eaf5fc; --muted:#bed2de; --line:#355365; }}
`;
