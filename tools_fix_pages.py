"""One-off repair script for the legacy lesson pages (kept in repo for transparency; safe to re-run)."""
import os, re, glob, urllib.parse
ROOT = os.path.dirname(os.path.abspath(__file__))
SPECIAL = {  # (file basename, broken href) -> new href
 ('grade1_lesson1.html', 'index.html#math-game'): 'countinggame.html',
 ('grade5_lesson1.html', 'grade4_lesson12.html'): '../Grade4/grade4_lesson14.html',
 ('grade2_lesson5.html', 'grade3_lesson2.html'): '../Grade3/grade3_lesson1.html',
 ('grade2_lesson5.html', '../grade2/grade2_lesson4.html'): 'grade2_lesson4.html',
}
stats = dict(files=0, links=0, md=0, latex=0, titles=0)

def tex(m):
    t = m.group(1)
    t = re.sub(r'\\frac\{([^}]*)\}\{([^}]*)\}', r'\1/\2', t)
    t = re.sub(r'\\text\{([^}]*)\}', r'\1', t)
    for a, b in [(r'\times', '×'), (r'\div', '÷'), (r'\cdot', '·'), (r'\,', ' '), (r'\%', '%'), (r'\le', '≤'), (r'\ge', '≥'), (r'\neq', '≠'), (r'\approx', '≈'), (r'\quad', ' '), (r'\ ', ' ')]:
        t = t.replace(a, b)
    stats['latex'] += 1
    return t.strip()

def clean_text(seg):
    seg = re.sub(r'\\l?dots', '…', seg)
    seg = re.sub(r'\\underline\{\\hspace\{[^}]*\}\}', '______', seg)
    seg = re.sub(r'\\hspace\{[^}]*\}', ' ', seg)
    def b(m): stats['md'] += 1; return '<strong>' + m.group(1) + '</strong>'
    seg = re.sub(r'\*\*([^*\n]+?)\*\*', b, seg)
    seg = re.sub(r'\$([^$\n<>]{1,90}?)\$', tex, seg)
    return seg

def fix(path):
    s = open(path, encoding='utf-8').read(); orig = s
    d = os.path.dirname(path); rel = os.path.relpath(ROOT, d).replace(os.sep, '/') + '/'
    base = os.path.basename(path)
    def link(m):
        attr, u = m.group(1), m.group(2)
        if (base, u) in SPECIAL: return '%s="%s"' % (attr, SPECIAL[(base, u)])
        if re.match(r'(https?:|mailto:|tel:|#|data:|javascript:)', u): return m.group(0)
        path_part, hashpart = (u.split('#', 1) + [''])[:2]; hashpart = ('#' + hashpart) if hashpart else ''
        if u.startswith('C:'): return '%s="%s"' % (attr, '../Grade1/grade1.html')
        name = re.sub(r'^(\.\./|/mathlanka/)+', '', path_part)
        if name == 'index.html': return '%s="%sindex.html%s"' % (attr, rel, hashpart)
        if name == 'login.html': return '%s="%slogin.html"' % (attr, rel)
        if name == 'signup.html': return '%s="%slogin.html?mode=signup"' % (attr, rel)
        if name.startswith('Gemini_Generated') and not os.path.exists(os.path.join(d, urllib.parse.unquote(path_part))): return '%s="%s%s"' % (attr, rel, name)
        tgt = os.path.normpath(os.path.join(d, urllib.parse.unquote(path_part))) if path_part else d
        if path_part and not os.path.exists(tgt):
            mm = re.search(r'(grade(\d)_lesson\d+|grade(\d))\.html$', path_part)
            if mm:  # missing lesson -> go to the grade page of the current folder
                g = re.search(r'Grade(\d)', d); 
                if g: return '%s="grade%s.html"' % (attr, g.group(1))
        return m.group(0)
    new = re.sub(r'(href|src)="([^"]*)"', link, s)
    stats['links'] += sum(1 for a, b in zip(re.findall(r'(?:href|src)="[^"]*"', s), re.findall(r'(?:href|src)="[^"]*"', new)) if a != b)
    s = new
    # text cleanup (skip scripts/styles/tags)
    parts = re.split(r'(<script.*?</script>|<style.*?</style>|<[^>]+>)', s, flags=re.S)
    s = ''.join(p if p.startswith('<') else clean_text(p) for p in parts)
    # titles
    if base == 'grade2_lesson5.html': s2 = s.replace('Lesson 1: Numbers up to 500', 'Lesson 5: Numbers up to 500'); stats['titles'] += s2 != s; s = s2
    if base == 'grade4_lesson2.html' and 'English Medium' in path:
        s2 = s.replace('පාඩම 2: එකතු කිරීම - 1 - විශාල සංඛ්‍යා එකතු කරමු!', "Lesson 2: Addition - 1 - Let's add big numbers!"); stats['titles'] += s2 != s; s = s2
    if base == 'grade3_lesson4.html':  # copy-paste leftovers from the addition lesson: script looked up *-add-* ids but the page has *-sub-* ids
        for a in ['next-vertical-add-btn', 'next-horizontal-add-btn', 'vertical-add-feedback', 'horizontal-add-feedback']: s = s.replace("'%s'" % a, "'%s'" % a.replace('-add-', '-sub-'))
    if base == 'grade3_lesson4.html':  # `const ones1/ones2` were declared inside the do-block but read in the while() condition -> ReferenceError
        s = s.replace("let num1, num2;\n                do {", "let num1, num2, ones1, ones2;\n                do {")
        s = s.replace("const ones1 = num1 % 10;", "ones1 = num1 % 10;").replace("const ones2 = num2 % 10;", "ones2 = num2 % 10;")
        s = s.replace("num1 = Math.floor(Math.random() * 90) + 10; // Generate num1 between 10 and 99", "num1 = Math.floor(Math.random() * 80) + 20; // num1 between 20 and 99")
    # mobile menu: the original script expects a hamburger button that was never in the markup -> it threw and aborted the page's other scripts
    s = s.replace("mobileMenuButton.addEventListener(", "if (mobileMenuButton) mobileMenuButton.addEventListener(")
    body_only = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    if 'mobileMenuButton' in s and not re.search(r'class="[^"]*\bmd:hidden\b', body_only):
        s = re.sub(r'(</nav>)', '<button class="md:hidden text-gray-700 text-2xl" aria-label="Menu"><i class="fas fa-bars"></i></button>\\1', s, count=1)
    if '</body>' not in s: s = s.rstrip() + '\n</body>\n</html>\n'
    # engine hook (nav chip, quiz on lessons)
    if 'assets/ml.js' not in s: s = s.replace('</body>', '<script src="%sassets/ml.js"></script>\n</body>' % rel, 1)
    if s != orig: open(path, 'w', encoding='utf-8').write(s); stats['files'] += 1

for f in glob.glob(os.path.join(ROOT, '*Medium', '**', '*.html'), recursive=True): fix(f)
# root-level pages
for name in ['index.html']:
    p = os.path.join(ROOT, name); s = open(p, encoding='utf-8').read()
    s = s.replace('href="dashboard.html"', 'href="learn.html"')
    if 'assets/ml.js' not in s: s = s.replace('</body>', '<script src="assets/ml.js"></script>\n</body>', 1)
    open(p, 'w', encoding='utf-8').write(s)
print(stats)
