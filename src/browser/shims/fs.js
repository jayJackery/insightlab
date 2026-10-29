import {readVirtualFile,saveVirtualFile,removeVirtualFile} from '../storage.js?v=0d401f7edfb044fc';
export async function readFile(path){return readVirtualFile(path);}
export async function writeFile(path,value,options){saveVirtualFile(path,value,options);}
export async function mkdir(){}
export async function access(path){readVirtualFile(path);}
export async function rename(from,to){saveVirtualFile(to,readVirtualFile(from));removeVirtualFile(from);}
