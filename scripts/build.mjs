import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'dist');
const files=JSON.parse(fs.readFileSync('scripts/site-files.json'));
fs.mkdirSync(out,{recursive:true});
// Remove only stale generated files inside the fixed dist directory.
for(const file of fs.readdirSync(out)){if(!files.includes(file)&&!['version.json','manifest.json'].includes(file))throw Error('Unexpected dist file: '+file)}
for(const file of files){if(path.basename(file)!==file)throw Error('Invalid build entry');fs.copyFileSync(file,path.join(out,file))}
const commit=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const version={commit,actionsUrl:process.env.GITHUB_RUN_ID?`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,repository:'z00d0llh0use-cpu/Sofia-Kitchen',buildTime:new Date().toISOString()};
fs.writeFileSync(path.join(out,'version.json'),JSON.stringify(version,null,2)+'\n');
const hashes=Object.fromEntries([...files,'version.json'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({commit,files:hashes},null,2)+'\n');
console.log(`Built ${files.length} website files + version/manifest for ${commit}`);
