import {mkdir,writeFile,access} from '../../browser/shims/fs.js?v=6cfce723d0abd3f5';
import {join} from '../../browser/shims/path.js?v=6cfce723d0abd3f5';
import {enrichSource} from '../../domain/evidence/source-document.js?v=6cfce723d0abd3f5';

export function createSourceStore(directory) {
  return async (sources) => {
    if (directory) await mkdir(directory,{recursive:true});
    const result=[];
    for (const source of sources) {
      const page=enrichSource(source);
      if (directory) {
        const name=page.document.contentHash+'.json', file=join(directory,name);
        try {await access(file);} catch {
          // Content-addressed immutable public-source snapshots. No executable remote content.
          await writeFile(file,JSON.stringify({contentHash:page.document.contentHash,content:page.content,format:page.document.format,parseStatus:page.document.parseStatus,blocks:page.document.blocks}),{flag:'wx'}).catch((error)=>{if(error.code!=='EEXIST')throw error;});
        }
        page.document.snapshotRef='source-snapshots/'+name;
      }
      result.push(page);
    }
    return result;
  };
}
