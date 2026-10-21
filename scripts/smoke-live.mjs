import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const origin='https://sofia-kitchen001.web.app/';
const manifest=JSON.parse(fs.readFileSync('dist/manifest.json'));
let last;
for(let attempt=0;attempt<6;attempt++){
 try{
  for(const [file,hash]of Object.entries(manifest.files)){
   const response=await fetch(origin+file+'?release='+manifest.commit,{signal:AbortSignal.timeout(20000),cache:'no-store'});
   assert.equal(response.status,200,file);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,file+' content differs');
  }
  const version=await fetch(origin+'version.json?release='+manifest.commit).then(r=>r.json());assert.equal(version.commit,manifest.commit);
  fs.mkdirSync('.deployment',{recursive:true});fs.writeFileSync('.deployment/smoke.json',JSON.stringify({commit:manifest.commit,checkedAt:new Date().toISOString(),files:Object.keys(manifest.files),result:'passed',scope:'HTTP status and exact deployed bytes; functional tests run on the same artifact with isolated SDK/emulator fixtures'},null,2));
  console.log('Live HTTP and byte checks passed for '+Object.keys(manifest.files).length+' files.');process.exit(0);
 }catch(error){last=error;if(attempt<5)await new Promise(r=>setTimeout(r,5000))}
}
throw last;
