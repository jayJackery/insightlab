import {mkdir,writeFile,access} from '../../browser/shims/fs.js';
import {join} from '../../browser/shims/path.js';
import {enrichSource} from '../../domain/evidence/source-document.js';

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
