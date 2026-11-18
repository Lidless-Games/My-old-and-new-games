from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
from rembg import remove, new_session
import numpy as np, os
S=new_session('isnet-general-use')
OUT='/home/claude/my-old-and-new-games/almaszedes/assets/img'; os.makedirs(OUT,exist_ok=True)
# background
bgc=Image.open('bg4.jpg')  # bg4.jpg = bg3_raw.jpg cropped (top 16.7%) + sky tint, see README.convert('RGB')
bgc.save(f'{OUT}/bg.jpg',quality=84)
fl=ImageEnhance.Brightness(ImageEnhance.Color(bgc).enhance(0.7)).enhance(1.35); fl.save(f'{OUT}/bg_flash.jpg',quality=84)
# apples
ap=remove(Image.open('apples.jpg').convert('RGB'),session=S); a=np.array(ap)[:,:,3]
prof=(a>128).sum(0).astype(float); cols=np.where(prof>0)[0]; L,R=cols[0],cols[-1]; span=R-L
def mn(c): lo,hi=int(c-span*0.08),int(c+span*0.08); return lo+int(np.argmin(prof[lo:hi]))
s1,s2=mn(L+span/3),mn(L+2*span/3)
groups=[(L,s1),(s1,s2),(s2,R)]; print('apple groups',groups)
names=['red','green','gold']
for n,(x0,x1) in zip(names,groups):
    sub=ap.crop((x0,0,x1+1,ap.height)); bb=sub.getbbox(); sub=sub.crop(bb)
    # trim faint floor reflections: keep rows with substantial alpha
    arr=np.array(sub)[:,:,3]; rows=np.where((arr>128).sum(1)>arr.shape[1]*0.08)[0]; sub=sub.crop((0,rows[0],sub.width,rows[-1]+1))
    s=100/max(sub.width,sub.height); sub=sub.resize((max(1,int(sub.width*s)),max(1,int(sub.height*s))),Image.LANCZOS)
    box=Image.new('RGBA',(134,134),(0,0,0,0)); box.paste(sub,((134-sub.width)//2,121-sub.height),sub); box.save(f'{OUT}/apple_{n}.png')
    print(n,sub.size)
# basin
bs=remove(Image.open('basin2.jpg').convert('RGB'),session=S); bs=bs.crop(bs.getbbox())
s=324/bs.width; bs=bs.resize((324,int(bs.height*s*0.68)),Image.LANCZOS)  # wide, shallow tub like the original
base=Image.new('RGBA',(360,360),(0,0,0,0)); bx,by=18,345-bs.height; base.paste(bs,(bx,by),bs); base.save(f'{OUT}/basin0.png')
A=np.array(base)[:,:,3]; ys,xs=np.where(A>128); topy=ys.min()
# rim ellipse: outer rim spans full width near top
cx=180; rx=162; ry=0.30*(bs.height*0.55)  # estimate
ry=71.0*0.68; cy=topy+ry
print('basin',bs.size,'top',topy,'ry',ry)
yy,xx=np.mgrid[0:360,0:360]
inside=((xx-cx)/rx)**2+((yy-cy)/ry)**2
frontEdge=cy+ry*np.sqrt(np.clip(1-((xx-cx)/rx)**2,0,1))
frontMask=(yy>=frontEdge-6)&(A>0)   # front wall incl. the near rim
apples={n:Image.open(f'{OUT}/apple_{n}.png') for n in names}
import random
def fill(stage):
    random.seed(stage)
    im=base.copy(); layer=Image.new('RGBA',(360,360),(0,0,0,0))
    counts={1:3,2:8,3:14}[stage]
    pts=[]
    for i in range(counts):
        row = 0 if i < 6 else (1 if i < 11 else 2)
        lift = [8, 32, 54][row] + (stage-1)*4
        t=(i if row==0 else (i-6 if row==1 else i-11))
        n_in_row=[6,5,3][row] if counts>row*6 else counts
        span=[220,170,110][row]
        x=cx-span/2+span*(t+0.5)/max(1,min(n_in_row, counts-(0 if row==0 else 6 if row==1 else 11)))
        y=cy+ry*0.8-lift+(3-stage)*6
        pts.append((x+random.uniform(-6,6),y+random.uniform(-4,4),random.choice(['red','red','red','green','gold'])))
    for x,y,n in sorted(pts,key=lambda p:p[1]):
        ap_=apples[n].resize((78,78),Image.LANCZOS).rotate(random.uniform(-25,25),resample=Image.BICUBIC)
        layer.alpha_composite(ap_,(int(x-39),int(y-39)))
    im.alpha_composite(layer)
    front=np.array(base); front[~frontMask]=0
    im.alpha_composite(Image.fromarray(front))
    im.save(f'{OUT}/basin{stage}.png')
for st in (1,2,3): fill(st)
# shadow
sh=Image.new('L',(240,80),0); d=ImageDraw.Draw(sh); d.ellipse((20,15,220,65),fill=150); sh=sh.filter(ImageFilter.GaussianBlur(12))
shadow=Image.new('RGBA',(240,80),(0,0,0,0)); shadow.putalpha(sh); shadow.save(f'{OUT}/shadow.png')
print('done')
# ---- wide basin variants (bonus): the tub is wider, the apples keep their shape ----
WF=1.6; WW=int(360*WF)
wbase=Image.new('RGBA',(WW,360),(0,0,0,0)); wb=bs.resize((int(324*WF),bs.height),Image.LANCZOS); wbase.paste(wb,(int(18*WF),by),wb)
wbase.save(f'{OUT}/basinw0.png')
WA=np.array(wbase)[:,:,3]; wcx=WW/2; wrx=162*WF
yy2,xx2=np.mgrid[0:360,0:WW]
wfront=cy+ry*np.sqrt(np.clip(1-((xx2-wcx)/wrx)**2,0,1))
wmask=(yy2>=wfront-6)&(WA>0)
def wfill(stage):
    random.seed(100+stage)
    im=wbase.copy(); layer=Image.new('RGBA',(WW,360),(0,0,0,0))
    rows={1:[5],2:[9,5],3:[10,8,5]}[stage]
    pts=[]
    for r,n in enumerate(rows):
        span=[360,280,180][r]; lift=[8,32,54][r]+(stage-1)*4
        for t in range(n):
            x=wcx-span/2+span*(t+0.5)/n; y=cy+ry*0.8-lift+(3-stage)*6
            pts.append((x+random.uniform(-6,6),y+random.uniform(-4,4),random.choice(['red','red','red','green','gold'])))
    for x,y,n in sorted(pts,key=lambda p:p[1]):
        ap_=apples[n].resize((78,78),Image.LANCZOS).rotate(random.uniform(-25,25),resample=Image.BICUBIC)
        layer.alpha_composite(ap_,(int(x-39),int(y-39)))
    im.alpha_composite(layer)
    fr=np.array(wbase); fr[~wmask]=0; im.alpha_composite(Image.fromarray(fr)); im.save(f'{OUT}/basinw{stage}.png')
for st in (1,2,3): wfill(st)
print('wide done')
