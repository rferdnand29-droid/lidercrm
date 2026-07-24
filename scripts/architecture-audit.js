#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] || process.cwd();
const exts = new Set(['.js','.ts','.tsx','.jsx']);
const targets = [];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) walk(full);
    else if(exts.has(path.extname(entry.name))) targets.push(full);
  }
}

function countFunctions(lines){
  const out=[];
  for(let i=0;i<lines.length;i++){
    const m = lines[i].match(/^\s*function\s+([A-Za-z0-9_$]+)\s*\(/);
    if(!m) continue;
    const name=m[1];
    let depth=0, started=false, j=i;
    for(;j<lines.length;j++){
      const s=lines[j];
      depth += (s.match(/\{/g)||[]).length;
      if(s.includes('{')) started=true;
      depth -= (s.match(/\}/g)||[]).length;
      if(started && depth<=0) break;
    }
    out.push({name,start:i+1,end:j+1,size:j-i+1});
    i=j;
  }
  return out;
}

walk(ROOT);
const summary = targets.map(file=>{
  const text = fs.readFileSync(file,'utf8');
  const lines = text.split(/\r?\n/);
  return {
    file: path.relative(ROOT,file),
    lines: lines.length,
    functions: countFunctions(lines).sort((a,b)=>b.size-a.size).slice(0,8)
  };
}).sort((a,b)=>b.lines-a.lines);

console.log(JSON.stringify({
  root: ROOT,
  largestFiles: summary.slice(0,20),
  generatedAt: new Date().toISOString()
}, null, 2));
