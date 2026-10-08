"""Builds public/js/products.js (no prices) and src/prices.js (dealer prices) from the price list.
Usage: python3 tools/hw/gen.py "tools/hw/Hoshizaki Western price List 01 04 2026.xlsx" .
"""
import openpyxl, json, re, sys
wb=openpyxl.load_workbook(sys.argv[1],data_only=True)
def s(v): return re.sub(r'\s+',' ',str(v).replace('\xa0',' ')).strip() if v is not None else ''
def num(v):
    try: float(v); return True
    except: return False
def tc(t):
    small={'and','of','on','&','-'}
    out=' '.join(w if w in small else w.capitalize() for w in t.lower().split())
    return out.replace('Modles','Models').replace('&ice','& Ice').replace('(fow)','(FOW)').replace('Visi ','Visi ')
def code(c):
    c=s(c).lstrip('/'); c=re.sub(r'-\s+','-',c); return c
items=[]
def add(brand,cat,c,desc='',note='',price=None):
    items.append(dict(b=brand,c=cat,m=code(c),d=s(desc),n=s(note),p=round(float(price),2)))
SUFFIX={'GD':'Golden','GY':'Grey','WH':'White','SS':'Stainless steel'}
for ws in wb:
    t=ws.title.strip(); rows=[[s(v) for v in r] for r in ws.iter_rows(values_only=True)]
    cat=None; brand='Hoshizaki'; lastdesc=''
    for r in rows:
        cells=[(j,v) for j,v in enumerate(r) if v]
        if not cells: continue
        low=' '.join(v for _,v in cells).lower()
        if any(k in low for k in ['terms','gst','freight','price list','sr. no','model','cap mentioned','pricing']) and not any(num(v) and float(v)>1000 for _,v in cells):
            if 'terms' in low: cat='__stop__'
            continue
        if cat=='__stop__': continue
        if t=='Western':
            if len(cells)==1: cat=tc(cells[0][1]); continue
            add('Western',cat,r[1],cat,r[2],r[3]); continue
        if t=='ICM .':
            if len(cells)==1:
                h=cells[0][1]; brand='Western' if h.startswith('Western') else 'Hoshizaki'
                cat=h.replace('( Imported)','(Imported)').strip(); cat=re.sub(r'^(Western|Hoshizaki) ','',cat); continue
            add(brand,cat,r[1],r[2],'',r[3]); continue
        off=1 if t in ('Back Bar','Prep Table') else 0
        m,d=r[off],r[off+1]
        if len(cells)==1:
            h=cells[0][1]
            if t.startswith('Pastry'):
                if 'Feet' in h: cat=('Premium Pastry Cabinets' if 'Premium' in t else 'Pastry Cabinets'); length=re.sub(r'.*=\s*','',h).replace(' Feet',' ft'); continue
                cat=h; length=''; continue
            cat=h; continue
        b='Western' if t in ('Pastry Standard','Dishwasher') else 'Hoshizaki'
        c={'Make Line':'Make Line & Pizza Tables','Dishwasher':'Dishwashers','Back Bar':'Back Bar Chillers','Prep Table':'Prep Tables'}.get(t,cat)
        if t.startswith('Pastry'):
            if not d:
                suf=code(m).split('-')[-1]; d=lastdesc+' – '+SUFFIX.get(suf,suf) if suf in SUFFIX else lastdesc
                if code(m).endswith('ANGD'): d=lastdesc+' – Golden'
            else: lastdesc=d
            if cat!='Vertical Pastry Cooler' and length: d=f'{length} · {d}'
        add(b,c,m,d,'',r[off+2])
from collections import Counter
print(Counter(i['b'] for i in items), len(items), file=sys.stderr)
for k,v in Counter(i['c'] for i in items).items(): print(v,k,file=sys.stderr)

# ---- post-process (clean names) ----
def clean_desc(d):
    d=re.sub(r'Cap(acity)?\s*:?\s*([\d.]+)\s*Kgs?\.?\s*/\s*(Day|24 hrs)',r'\2 kg/day',d,flags=re.I)
    d=re.sub(r'^([\d.]+)\s*Kgs?/\s*Day',r'\1 kg/day',d,flags=re.I)
    d=re.sub(r'Capacity ([\d.]+) Kg\.?$',r'\1 kg storage',d)
    d=re.sub(r'L=(\d+)mm',r'L \1 mm',d); d=re.sub(r'Depth :(\d+)mm',r'Depth \1 mm',d)
    d=re.sub(r'\s*;\s*',' · ',d); d=re.sub(r'(Door) (L \d)',r'\1 · \2',d)
    return d.strip()
out=[]
for i in items:
    c,d,n=i['c'],i['d'],i['n']
    if c=='Premium Pastry Cabinets': i['b']='Western'
    m=re.match(r'^(Premium )?Undercounter (Chillers|Freezers) ; Depth : (\d+) mm(.*GN)?',c)
    if m:
        c=f"{m.group(1) or ''}Undercounter {m.group(2)}"; d=f"{d} · Depth {m.group(3)} mm"+(' · GN rails' if m.group(4) else '')
    c={'Premium series Upright Chillers & Freezers':'Premium Upright Chillers & Freezers','Drawer Premium Units':'Premium Drawer Units',
       'Drawer Low height Premium Units':'Premium Drawer Units (Low Height)','Combi - Cooler/freezer':'Combi Cooler / Freezer',
       'Visi Cooler - Canopy & Non Canopy - (fixed System)':'Visi Cooler – Canopy & Non Canopy (Fixed System)',
       'Ice Makers':'Ice Makers','Visi Cooler Non Canopy':'Visi Cooler – Non Canopy'}.get(c,c).replace(' - ',' – ')
    if i['b']=='Western' and d==i['c']:
        d=''
        if n:
            d=('Old model '+n) if re.fullmatch(r'[A-Z0-9][A-Z0-9\-/ ]*[0-9][A-Z0-9\-/ ]*( \(.*\))?',n) and not n.startswith('GLASS') else n.capitalize() if n.isupper() else n
        n=''
    d=clean_desc(d)
    out.append(dict(b=i['b'],c=c,m=i['m'],d=d,p=i['p']))
from collections import Counter
print(Counter(i['b'] for i in out),file=sys.stderr)

import os
root=sys.argv[2]
pub=[{k:v for k,v in i.items() if k!='p'} for i in out]
open(os.path.join(root,'public/js/products.js'),'w').write(
  '// Generated by tools/hw/gen.py from the Hoshizaki & Western price list (wef 1 Apr 2026). NO PRICES here: this file is public.\n'
  'window.HW_PRODUCTS='+json.dumps(pub,ensure_ascii=False,separators=(',',':'))+';\n')
open(os.path.join(root,'src/prices.js'),'w').write(
  '// Generated by tools/hw/gen.py. Dealer prices (DP, excl. GST) wef 1 Apr 2026. Served only by /api/team/prices.\n'
  'export default '+json.dumps({i['m']:i['p'] for i in out},ensure_ascii=False,separators=(',',':'))+';\n')
