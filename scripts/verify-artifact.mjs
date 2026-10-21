import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('dist/manifest.json'));
if(process.env.GITHUB_SHA)assert.equal(manifest.commit,process.env.GITHUB_SHA);
for(const [name,hash]of Object.entries(manifest.files)){assert.ok(!name.includes('/')&&!name.includes('\\'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/'+name)).digest('hex'),hash,name)}
assert.deepEqual(fs.readdirSync('dist').sort(),[...Object.keys(manifest.files),'manifest.json'].sort());
console.log('Verified immutable build artifact: '+manifest.commit);
