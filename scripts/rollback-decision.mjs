export function rollbackDecision({previous,current,ours,commit}){
 if(!previous?.release?.version?.name||!current?.release?.version?.name)throw Error('Missing release identity');
 if(current.release.version.name===previous.release.version.name)return 'unchanged';
 if(ours&&current.release.name!==ours.release)throw Error('A newer release exists; refusing automatic rollback over it');
 if(!ours&&(!commit||!String(current.release.message||'').includes('commit '+commit+';')))throw Error('Cannot identify current release as this run; manual recovery required');
 return 'rollback';
}
