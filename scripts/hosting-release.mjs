import fs from 'node:fs';import {GoogleAuth} from 'google-auth-library';
import {rollbackDecision} from './rollback-decision.mjs';
const site='sofia-kitchen001',base='https://firebasehosting.googleapis.com/v1beta1';
const auth=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/firebase.hosting']}).getClient();
const request=async(method,url,data)=> (await auth.request({method,url:base+url,...(data?{data}:{})})).data;
const getLive=()=>request('GET',`/sites/${site}/channels/live`);
fs.mkdirSync('.deployment',{recursive:true});
const write=(name,value)=>fs.writeFileSync('.deployment/'+name,JSON.stringify(value,null,2)+'\n');
const mode=process.argv[2];
if(mode==='before'){
 const before=await getLive();write('before.json',before);console.log('Rollback target: '+before.release.version.name);
}else if(mode==='after'){
 const live=await getLive();
 const record={commit:process.env.GITHUB_SHA,actionsUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,hostingUrl:'https://sofia-kitchen001.web.app/',versionId:live.release.version.name.split('/').at(-1),release:live.release.name,releaseTime:live.release.releaseTime,previousVersion:JSON.parse(fs.readFileSync('.deployment/before.json')).release.version.name};
 write('release.json',record);console.log(JSON.stringify(record,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n### Firebase release\n- Commit: ${record.commit}\n- Actions: ${record.actionsUrl}\n- Version: ${record.versionId}\n- Release: ${record.release}\n- Previous: ${record.previousVersion}\n- Site: ${record.hostingUrl}\n`);
}else if(mode==='rollback'){
 const before=JSON.parse(fs.readFileSync('.deployment/before.json'));
 const live=await getLive();
 // Refuse to replace a release made by somebody else after this run.
 const ours=fs.existsSync('.deployment/release.json')?JSON.parse(fs.readFileSync('.deployment/release.json')):null;
 if(rollbackDecision({previous:before,current:live,ours,commit:process.env.GITHUB_SHA})==='unchanged'){console.log('Live already matches rollback target');process.exit(0)}
 const release=await request('POST',`/sites/${site}/channels/live/releases?versionName=${encodeURIComponent(before.release.version.name)}`,{type:'ROLLBACK',message:`Automatic recovery after failed checks; failed commit ${process.env.GITHUB_SHA}`});
 write('rollback.json',release);const verified=await getLive();if(verified.release.version.name!==before.release.version.name)throw Error('Rollback verification failed');
 console.log('ROLLBACK confirmed: '+before.release.version.name);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n### Automatic rollback\nRestored ${before.release.version.name}. See rollback.json artifact.\n`);
}else throw Error('Use before, after or rollback');
