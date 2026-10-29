"""Local source-pixel extraction and reproducible visual QA (no remote APIs)."""
import argparse, hashlib, json, os
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p): return np.asarray(Image.open(p).convert('RGB'),dtype=float)
def save_json(p,v): Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def mask_checks(a):
    errors=[]
    if a.ndim!=2 or not a.size: return ['invalid mask']
    if np.max(np.r_[a[0],a[-1],a[:,0],a[:,-1]])>0: errors.append('foreground touches ROI boundary: expand ROI')
    coverage=float(np.mean(a>0))
    if coverage<.005 or coverage>.94: errors.append('empty or rectangular/background-attached mask')
    if np.mean(a>=254)<.005: errors.append('no reliable opaque core')
    return errors

def extract(source,box,background,out,mask=None):
    """ROI is a search boundary, never the final asset. Reject unsafe segmentation."""
    out=Path(out);out.parent.mkdir(parents=True,exist_ok=True)
    src=Image.open(source).convert('RGB');x,y,w,h=map(int,box)
    if min(x,y)<0 or min(w,h)<=0 or x+w>src.width or y+h>src.height: raise ValueError('ROI outside source')
    rgb=np.asarray(src.crop((x,y,x+w,y+h)),dtype=float)
    bg=np.asarray(Image.open(background).convert('RGB').crop((x,y,x+w,y+h)),dtype=float)
    if rgb.shape!=bg.shape: raise ValueError('background must match source dimensions')
    if mask:
        a=np.asarray(Image.open(mask).convert('L'))
        if a.shape!=(h,w): raise ValueError('mask must match ROI')
    else:
        d=np.sqrt(np.mean((rgb-bg)**2,axis=2))
        a=np.uint8(np.clip((d-15)/18,0,1)*255)
        # No forced zero border: boundary failures must remain detectable.
    errors=mask_checks(a)
    if errors: raise ValueError('; '.join(errors))
    af=a[:,:,None]/255
    fg=np.clip((rgb-(1-af)*bg)/np.maximum(af,.03),0,255)
    fg[af[:,:,0]>=1]=rgb[af[:,:,0]>=1] # exact opaque source pixels
    rgba=np.dstack([np.rint(fg).astype('uint8'),a]);Image.fromarray(rgba).save(out)
    mp=out.with_suffix('.mask.png');Image.fromarray(a).save(mp)
    evidence={'source':str(Path(source).resolve()),'source_sha256':digest(source),'source_box':list(box),'background':str(Path(background).resolve()),'background_sha256':digest(background),'mask':str(mp.resolve()),'mask_sha256':digest(mp),'asset_sha256':digest(out),'method':'source compositing equation; opaque pixels unchanged','checks':errors,'soft_pixel_fraction':float(np.mean((a>0)&(a<255)))}
    for key in ('source','background','mask'): evidence[key]=os.path.relpath(evidence[key],out.parent)
    save_json(out.with_suffix('.evidence.json'),evidence)
    return evidence

def validate_masked(asset,evidence):
    try:
        e=json.loads(Path(evidence).read_text())
        for key in ('source','background','mask'): e[key]=str((Path(evidence).resolve().parent/e[key]).resolve())
        a=np.asarray(Image.open(asset).convert('RGBA'));mask=np.asarray(Image.open(e['mask']).convert('L'))
        errors=mask_checks(mask)
        for field,path in [('source',e['source']),('background',e['background']),('mask',e['mask']),('asset',asset)]:
            if digest(path)!=e[field+'_sha256']: errors.append(field+' hash mismatch')
        if not np.array_equal(a[:,:,3],mask): errors.append('alpha differs from evidence mask')
        x,y,w,h=e['source_box'];src=read(e['source'])[y:y+h,x:x+w];bg=read(e['background'])[y:y+h,x:x+w]
        if a.shape[:2]!=(h,w): errors.append('asset dimensions mismatch')
        else:
            core=mask==255
            if not np.array_equal(a[:,:,:3][core],src[core]): errors.append('opaque source pixels changed')
            af=mask[:,:,None]/255
            visible=mask>0
            err=np.abs(a[:,:,:3]*af+bg*(1-af)-src).mean(axis=2)
            if np.mean(err[visible])>2: errors.append('edge compositing residual exceeds 2 RGB levels')
        return errors
    except Exception as ex: return ['invalid mask evidence: '+str(ex)]

def ssim(a,b):
    # Standard local SSIM, 11px uniform window; report convention explicitly.
    def blur(x): return np.asarray(Image.fromarray(x.astype('float32'),'F').filter(ImageFilter.BoxBlur(5)),dtype=float)
    # Pillow floating-point BoxBlur is unsupported on some versions: use summed-area filter.
    def mean(x):
        v=np.pad(x,((5,5),(5,5)),mode='reflect');s=np.pad(v,((1,0),(1,0))).cumsum(0).cumsum(1)
        return (s[11:,11:]-s[:-11,11:]-s[11:,:-11]+s[:-11,:-11])/121
    a=a.mean(2);b=b.mean(2);ma=mean(a);mb=mean(b);va=mean(a*a)-ma*ma;vb=mean(b*b)-mb*mb;cov=mean(a*b)-ma*mb
    return float(np.mean(((2*ma*mb+6.5025)*(2*cov+58.5225))/((ma*ma+mb*mb+6.5025)*(va+vb+58.5225))))

def qa(source,render,out,regions=None):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    a=Image.open(source).convert('RGB');b=Image.open(render).convert('RGB')
    # Contain source in slide canvas; no aspect-ratio distortion.
    scale=min(b.width/a.width,b.height/a.height);small=a.resize((round(a.width*scale),round(a.height*scale)),Image.Resampling.LANCZOS)
    ref=Image.new('RGB',b.size,small.getpixel((0,0)));ref.paste(small,((b.width-small.width)//2,(b.height-small.height)//2))
    av=np.asarray(ref,dtype=float);bv=np.asarray(b,dtype=float);d=np.abs(av-bv).mean(2)
    heat=np.zeros_like(av);heat[:,:,0]=np.clip(d*5,0,255);heat[:,:,1]=np.clip(d-35,0,255)
    Image.fromarray(heat.astype('uint8')).save(out/'heatmap.png')
    compare=Image.new('RGB',(b.width*2,b.height));compare.paste(ref);compare.paste(b,(b.width,0));compare.save(out/'comparison.png')
    r={'ssim':ssim(av,bv),'rgb_mae':float(d.mean()),'ssim_convention':'11x11 uniform-window grayscale, data_range=255','alignment':'contain source in render canvas','regions':[]}
    for region in regions or []:
        x,y,w,h=region['box'];aa=av[y:y+h,x:x+w];bb=bv[y:y+h,x:x+w]
        if min(aa.shape[:2])<12: raise ValueError('QA region too small')
        r['regions'].append({'id':region['id'],'ssim':ssim(aa,bb),'rgb_mae':float(np.abs(aa-bb).mean())})
    save_json(out/'quality.json',r);return r

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='cmd',required=True)
    q=sub.add_parser('qa');q.add_argument('source');q.add_argument('render');q.add_argument('out');q.add_argument('--regions')
    e=sub.add_parser('extract');e.add_argument('source');e.add_argument('background');e.add_argument('out');e.add_argument('--box',nargs=4,type=int,required=True);e.add_argument('--mask')
    for name in ('fit-background','seed-mask'):
        c=sub.add_parser(name);c.add_argument('source');c.add_argument('out');c.add_argument('--box',nargs=4,type=int,required=True)
        if name=='seed-mask': c.add_argument('--background',required=True);c.add_argument('--seed',nargs=2,type=int,required=True)
    a=p.parse_args()
    if a.cmd=='qa': print(json.dumps(qa(a.source,a.render,a.out,json.loads(Path(a.regions).read_text()) if a.regions else None)))
    elif a.cmd=='extract': print(json.dumps(extract(a.source,a.box,a.background,a.out,a.mask)))
    elif a.cmd=='fit-background': print(json.dumps(fit_background(a.source,a.box,a.out)))
    else: print(seeded_mask(a.source,a.background,a.box,a.seed,a.out))


def fit_background(source, box, out):
    """Fit empty ROI border samples, trimming contaminants. Refuse complex residuals."""
    rgb=read(source);x,y,w,h=map(int,box);a=rgb[y:y+h,x:x+w];yy,xx=np.mgrid[0:h,0:w]
    border=(xx<4)|(yy<4)|(xx>=w-4)|(yy>=h-4)
    X=np.stack([xx*0+1,xx/w,yy/h],axis=2);v=X[border];target=a[border];keep=np.ones(len(v),dtype=bool)
    for _ in range(4):
        coef=np.linalg.lstsq(v[keep],target[keep],rcond=None)[0];res=np.sqrt(np.mean((v@coef-target)**2,axis=1));keep=res<=max(3,float(np.quantile(res,.8)))
    residual=float(np.mean(res[keep]));constant=float(np.mean(np.std(target[keep],axis=0)))
    if residual>6: raise ValueError('complex border background: explicit clean-base/mask needed')
    bg=rgb.copy();bg[y:y+h,x:x+w]=np.clip(X@coef,0,255);Image.fromarray(np.uint8(bg)).save(out)
    return {'classification':'solid' if constant<2 else 'linear-local','border_rmse':residual,'note':'ROI-only fitted background; outside ROI is never an output layer'}

def compare_text(reference, candidate):
    """Stable IDs required. Never invent OCR confidence or silently fuzzy-match text."""
    by_id={x['id']:x for x in candidate};results=[]
    for a in reference:
        b=by_id.get(a['id'])
        if b is None: results.append({'id':a['id'],'missing':True});continue
        x,y,w,h=a['box_px'];u,v,s,t=b['box_px'];inter=max(0,min(x+w,u+s)-max(x,u))*max(0,min(y+h,v+t)-max(y,v))
        results.append({'id':a['id'],'text_equal':a['text']==b['text'],'box_iou':inter/max(w*h+s*t-inter,1),'center_distance_px':float(((x+w/2-u-s/2)**2+(y+h/2-v-t/2)**2)**.5)})
    return results

def regression_plan(baseline,current,global_tolerance=.01,region_tolerance=.05):
    old={x['id']:x for x in baseline['regions']}
    return {'global_passed':current['ssim']>=baseline['ssim']-global_tolerance,'threshold_policy':{'global_ssim_floor':baseline['ssim']-global_tolerance,'regional_ssim_max_drop':region_tolerance},'reprocess_regions':[x['id'] for x in current['regions'] if x['id'] in old and x['ssim']<old[x['id']]['ssim']-region_tolerance],'automation':'diagnostic plan only; agent must repair selected regions and rerun QA'}

def seeded_mask(source,background,box,seed,out):
    """Color-seeded segmentation for isolated colored objects; not semantic segmentation.
    Keep source-derived soft alpha within a 15px neighborhood of the seed color support.
    Caller must inspect completeness; overlapping objects/low contrast require a supplied mask.
    """
    x,y,w,h=box;rgb=read(source)[y:y+h,x:x+w];bg=read(background)[y:y+h,x:x+w]
    color=read(source)[seed[1],seed[0]];direction=color-bg.mean((0,1));norm=np.sum(direction**2)
    if norm<400: raise ValueError('foreground seed too similar to background')
    projection=np.sum((rgb-bg)*direction,axis=2)/norm
    cosine=np.sum((rgb-bg)*direction,axis=2)/np.maximum(np.linalg.norm(rgb-bg,axis=2)*np.sqrt(norm),1e-6)
    support=np.uint8((projection>.18)&(cosine>.8))*255
    support=np.asarray(Image.fromarray(support).filter(ImageFilter.MaxFilter(31)))>0
    d=np.sqrt(np.mean((rgb-bg)**2,axis=2));alpha=np.uint8(np.clip((d-6)/18,0,1)*255);alpha[~support]=0
    errors=mask_checks(alpha)
    if errors: raise ValueError('; '.join(errors))
    Image.fromarray(alpha).save(out);return out

if __name__=='__main__': main()
