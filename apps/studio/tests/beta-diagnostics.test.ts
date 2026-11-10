import { it,expect,vi,afterEach } from 'vitest';
import JSZip from 'jszip';
import { betaDiagnosticZip,recordBetaEvent,readBetaEvents } from '../src/lib/beta-diagnostics';
import { newProject } from '../src/lib/project';
let data='';vi.stubGlobal('localStorage',{getItem:()=>data,setItem:(_k:string,v:string)=>{data=v;}});
afterEach(()=>{data='';});
it('bounded diagnostics exclude arbitrary error fields, names, text, URLs and keys',async()=>{
 for(let i=0;i<90;i++)recordBetaEvent({feature:'analysis',stage:'ai',outcome:'error',code:'unknown',...{message:'PRIVATE_API_KEY',image:'PRIVATE_IMAGE',text:'PRIVATE_TEXT'}});
 expect(readBetaEvents()).toHaveLength(80);expect(data).not.toContain('PRIVATE');
 const p=newProject('PRIVATE_NAME');const z=await JSZip.loadAsync(await(await betaDiagnosticZip(p,false)).arrayBuffer());expect(z.file('project.studio.zip')).toBeNull();const log=await z.file('diagnostics.json')!.async('string');expect(log).not.toContain('PRIVATE');
});
it('project bytes are included only by an explicit local export choice',async()=>{
 const z=await JSZip.loadAsync(await(await betaDiagnosticZip(newProject(),true)).arrayBuffer());expect(z.file('project.studio.zip')).not.toBeNull();
});
