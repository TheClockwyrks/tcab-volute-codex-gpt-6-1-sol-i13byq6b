"""One-time asset authoring; never used by npm build. Requires the run's asset tools."""
import json, subprocess, pathlib, math, random
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; OUT.mkdir(parents=True,exist_ok=True)
TMP=pathlib.Path('/tmp/volute-author'); TMP.mkdir(exist_ok=True)
def run(tool,cfg,*args):
    p=subprocess.run([tool,'--config',str(cfg),*map(str,args)],capture_output=True,text=True)
    if p.returncode: raise RuntimeError(p.stderr)
def config(name,**kw):
    d=dict(actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.png')),**kw)
    p=TMP/(name+'.json'); p.write_text(json.dumps(d)); return p,d

def rect(x,y,w,h,c): return dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c)
def circle(x,y,r,c,stroke=False): return dict(op='stroke_circle' if stroke else 'fill_circle',cx=x,cy=y,r=r,color=c)
def line(x,y,a,b,c): return dict(op='line',x0=x,y0=y,x1=a,y1=b,color=c)
def sprite(name,w,h,ops,sheet=False):
    p,d=config(name,width=w,height=h,background='#00000000',**({'frames':[0]} if sheet else {}))
    pathlib.Path(d['actions']).write_text(json.dumps(ops))
    run('draw-sheet' if sheet else 'draw',p,'render','--actions',d['actions'],'--out',d['preview'],'--width',w,'--height',h)
    import shutil
    shutil.copy(d['preview'],OUT/(name+'.png'))
colors=['#59e2d0','#ffd36a','#7cb7ff','#f17b96','#b5e475']
for k,(name,col) in enumerate(zip(['halide','sulfur','cobalt','garnet','olivine'],colors)):
    ops=[circle(14,14,13,'#081a22'),circle(14,13,12,col),circle(15,16,10,'#254652'),circle(13,12,10,col),rect(7,5,9,2,'#e8fff2'),rect(5,8,2,5,'#e8fff2'),rect(18,18,4,3,'#162f40')]
    # Different mineral glyphs, cut into the bright face.
    glyphs=[[(9,8,2,10),(17,8,2,10),(11,12,6,2)],[(10,9,8,2),(10,12,8,2),(10,15,8,2)],[(10,9,2,8),(17,9,2,8),(12,9,5,2),(12,15,5,2)],[(13,8,2,10),(9,12,10,2)],[(9,9,3,3),(16,9,3,3),(12,15,4,3)]]
    ops += [rect(*g,'#173843') for g in glyphs[k]]
    sprite('core-'+name,28,28,ops)
for k,name in enumerate(['choke','backflow','bore','sightline']):
    ops=[circle(8,8,7,'#11242d'),circle(8,8,7,'#fff4cd',True)]
    if k==0: ops += [rect(4,4,8,2,'#fff4cd'),rect(4,10,8,2,'#fff4cd'),rect(6,6,4,4,'#fff4cd')]
    if k==1: ops += [rect(4,7,9,2,'#fff4cd'),line(4,8,8,4,'#fff4cd'),line(4,8,8,12,'#fff4cd')]
    if k==2: ops += [circle(8,8,4,'#fff4cd',True),rect(7,2,2,12,'#fff4cd'),rect(2,7,12,2,'#fff4cd')]
    if k==3: ops += [circle(8,8,4,'#fff4cd',True),circle(8,8,1,'#fff4cd')]
    sprite('mark-'+name,16,16,ops)
base=[circle(22,22,21,'#08151c'),circle(22,21,19,'#688080'),circle(22,22,16,'#263d47'),circle(22,22,12,'#122832'),circle(22,22,12,'#caa772',True)]
for x,y in [(9,9),(32,9),(9,32),(32,32)]: base += [rect(x,y,3,3,'#a8bcaf'),rect(x,y,1,1,'#f2edc9')]
sprite('injector-base',44,44,base)
def barrel(offset=0):
    return [rect(3-offset,4,37,13,'#071a22'),rect(5-offset,3,31,12,'#526c73'),rect(7-offset,5,26,7,'#91a5a0'),rect(8-offset,9,27,5,'#2d444e'),rect(29-offset,1,9,18,'#b89b6b'),rect(32-offset,3,8,14,'#314c57'),rect(38-offset,5,5,10,'#0b202b'),rect(13-offset,4,2,9,'#d5c399'),rect(20-offset,4,2,9,'#d5c399')]
sprite('injector-barrel',44,20,barrel())
for i,o in enumerate([5,3,1,0]): sprite('recoil-'+str(i),44,20,barrel(o),True)
def maw(r=19):
    a=[circle(32,32,31,'#08141b'),circle(32,30,29,'#7c847a'),circle(32,32,26,'#293c44'),circle(32,32,23,'#c0a16f'),circle(32,32,r+2,'#442d2d'),circle(32,32,r,'#030d14')]
    for j in range(8):
        ang=j*math.pi/4; x=round(32+25*math.cos(ang)); y=round(32+25*math.sin(ang)); a.append(rect(x-1,y-1,3,3,'#e0cd96'))
    a += [rect(25,29,14,2,'#2f4146'),rect(29,33,8,2,'#152b35')]
    return a
sprite('intake-maw',64,64,maw())
for i,r in enumerate([19,22,24,22,18,19]): sprite('swallow-'+str(i),64,64,maw(r),True)
for i in range(6):
    a=[]; r=4+i*3
    a += [circle(24,24,r,'#effff2',True),circle(24,24,max(1,r-2),'#b6e5d0',True)]
    for j in range(8):
        ang=j*math.pi/4; a += [rect(round(24+math.cos(ang)*(r+4)),round(24+math.sin(ang)*(r+4)),2,2,'#ffffff')]
    sprite('flash-'+str(i),48,48,a,True)
a=[rect(0,0,64,64,'#25353c'),rect(0,0,64,2,'#4c6063'),rect(0,62,64,2,'#10232b')]
random.seed(19)
for i in range(160):
    x=random.randrange(64); y=random.randrange(3,61); a.append(rect(x,y,1,1,random.choice(['#2b3d43','#304148','#203139'])))
for x,y in [(4,5),(57,5),(4,56),(57,56)]: a += [rect(x,y,3,3,'#15262e'),rect(x,y,2,1,'#6a7774')]
sprite('channel-plate',64,64,a)
sprite('cell',24,24,[rect(5,3,14,18,'#10212a'),rect(7,4,10,16,'#82978a'),rect(9,6,6,11,'#66e1c0'),rect(10,2,4,2,'#cfcead'),rect(10,7,2,7,'#e5ffdf')])
sprite('pressure',24,24,[circle(12,12,10,'#c9b58b'),circle(12,12,8,'#1d3540'),line(12,12,17,6,'#f4d58b'),rect(11,11,3,3,'#f4d58b')])
# Sound cues, authored with distinct layered timbres.
for i,name in enumerate(['fire','seat','swap','denied','machinery']):
    p,d=config(name,sample_rate=22050,channels='mono',max_duration_ms=450,seed=40+i,wav=str(OUT/(name+'.wav')))
    run('sfx-synth',p,'init')
    for voice,wave,freq,gain,dur in [('body','triangle',[170,240,650,95,520][i],-15,[85,100,55,180,250][i]),('air','noise',440,-24,55)]:
        run('sfx-synth',p,'add-voice','--name',voice,'--wave',wave,'--freq',freq,'--gain',gain,'--dur',dur)
        run('sfx-synth',p,'set-envelope','--voice',voice,'--env','pluck')
    run('sfx-synth',p,'set-pitch','--voice','body','--slide-to',[60,100,1000,65,1200][i],'--over',150)
    run('sfx-synth',p,'render')
for i,name in enumerate(['extract-1','extract-2','extract-3','extract-4','extract-5','intake','level-clear','cell-lost']):
    p,d=config(name,sample_rate=22050,channels='mono',max_duration_ms=1400 if i>4 else 500,seed=91+i,sample_pack='combat-core',wav=str(OUT/(name+'.wav')))
    run('sfx-sample',p,'init')
    sample='impact_metal_dry' if i<5 else ['boom_sub_rumble','clang_metal','cannon_body_heavy'][i-5]
    run('sfx-sample',p,'add-sample','--name',sample,'--t',0,'--gain',-9 if i<5 else -13,'--pitch',i*3 if i<5 else 0,'--fade-out',60)
    if i==6:
        run('sfx-sample',p,'add-sample','--name','impact_metal_dry','--t',180,'--pitch',12,'--gain',-9)
    run('sfx-sample',p,'render')
for danger in [False,True]:
    name='danger-loop' if danger else 'hall-loop'; tempo=120 if danger else 80
    p,d=config(name,sample_rate=22050,channels='stereo',max_duration_ms=12000 if not danger else 8000,seed=51,instrument_bank='synthwave',wav=str(OUT/(name+'.wav')),mid=str(OUT/(name+'.mid')))
    run('music',p,'init'); run('music',p,'set-tempo','--bpm',tempo)
    for track,inst,gain in [('bass','synth_bass',-23),('bell','fm_bell',-29),('pulse','kick_808',-26)]:
        run('music',p,'define-track','--name',track,'--instrument',inst)
        run('music',p,'set-track-fx','--track',track,'--gain',gain,'--env','pluck')
    for b in range(16):
        run('music',p,'add-note','--track','bass','--pitch',[36,36,43,39][b//4],'--t',b,'--dur',0.65,'--velocity',90)
        if b%2==0 or danger: run('music',p,'add-note','--track','pulse','--pitch',36,'--t',b,'--dur',0.2,'--velocity',80)
        if b%2==0: run('music',p,'add-note','--track','bell','--pitch',[60,67,63,70][(b//2)%4],'--t',b+0.5,'--dur',0.4,'--velocity',65)
    run('music',p,'render')
# Live particle systems.
for name,count,speed,life,color in [('extraction',22,110,260,'#79f7dd'),('bore',52,160,650,'#ffd49b'),('intake',24,65,380,'#9daaaa'),('pickup',16,55,550,'#fff5b2')]:
    p,d=config(name,width=200,height=200,duration_ms=900,fps=60,seed=23,system=str(OUT/(name+'.json')))
    run('particle-2d',p,'init')
    run('particle-2d',p,'add-emitter','--name','spark','--shape','point','--x',100,'--y',100,'--burst',count,'--lifetime',life,'--lifetime-spread',70,'--speed',speed,'--speed-spread',25,'--cone-angle',180 if name in ['extraction','bore'] else 35,'--dir-y',-1 if name=='intake' else 1)
    run('particle-2d',p,'set-particle','--emitter','spark','--size-from',1,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',color+'@0,#ffffff@0.3,'+color+'@1')
    run('particle-2d',p,'set-forces','--drag',2,'--gravity',-40)
    run('particle-2d',p,'render')
# Mastering: exact sixteen-beat beds, comfortable levels, and zero-crossing fades.
import wave, struct
for name,target in [('hall-loop',0.16),('danger-loop',0.20),('extract-1',0.23),('extract-2',0.23),('extract-3',0.23),('extract-4',0.23),('extract-5',0.23),('intake',0.45),('level-clear',0.38),('cell-lost',0.60)]:
    filename=OUT/(name+'.wav')
    with wave.open(str(filename),'rb') as wav:
        rate=wav.getframerate(); channels=wav.getnchannels()
        values=list(struct.unpack('<'+'h'*(wav.getnframes()*channels),wav.readframes(wav.getnframes())))
    peak=max(abs(v) for v in values) or 1
    gain=target*32767/peak
    values=[round(v*gain) for v in values]
    if name.endswith('loop'):
        frames=rate*(12 if name=='hall-loop' else 8)
        values=(values+[0]*(frames*channels))[:frames*channels]
        fade=round(rate*.006)
        for i in range(fade):
            for c in range(channels):
                values[i*channels+c]=round(values[i*channels+c]*i/fade)
                j=(frames-1-i)*channels+c;values[j]=round(values[j]*i/fade)
    with wave.open(str(filename),'wb') as wav:
        wav.setnchannels(channels);wav.setsampwidth(2);wav.setframerate(rate)
        wav.writeframes(struct.pack('<'+'h'*len(values),*values))
print('Assets produced in',OUT)
