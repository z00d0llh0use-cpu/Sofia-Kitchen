/* Local preview fixture. The server injects this file only with --demo; it is never hosted. */
window.SOFIA_DEMO_LOADER=async()=>{
  const dbKey='sofia_member_demo_db_v1',accountKey='sofia_member_demo_accounts_v1',sessionKey='sofia_member_demo_session_v1';
  const founder=window.SOFIA_FIREBASE_SETTINGS.founderUid;
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const stamp=()=>({demoTimestamp:Date.now()});
  let accounts=JSON.parse(localStorage.getItem(accountKey)||'null');
  async function hash(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
  if(!accounts){const pass=await hash('RecipeDemo2026!');accounts={'sofia@demo.local':{uid:founder,email:'sofia@demo.local',displayName:'Sofia',passwordHash:pass},'friend@demo.local':{uid:'demo-friend-001',email:'friend@demo.local',displayName:'料理朋友',passwordHash:pass}};localStorage.setItem(accountKey,JSON.stringify(accounts));}
  let data=JSON.parse(localStorage.getItem(dbKey)||'null');
  if(!data){data={};for(const account of Object.values(accounts)){data['profiles/'+account.uid]={displayName:account.displayName,createdAt:stamp()};data['books/'+account.uid]={ownerId:account.uid,title:account.displayName+'的食譜本',visibility:account.uid===founder?'members':'private',template:'sofia-v1',createdAt:stamp()};}
    const recipe={id:'demo-tomato-eggs',title:'番茄炒蛋',category:'chinese',time:'15 分鐘',mood:'家常料理',emoji:'🍅',imageUrl:'',ingredients:['番茄 2 顆','雞蛋 3 顆','鹽 適量'],prePrep:'番茄切塊，雞蛋打散。',steps:['先炒蛋並盛起。','炒軟番茄，加入雞蛋調味。'],tip:'依自己的喜好調整味道。'};
    data['books/'+founder+'/recipes/'+recipe.id]=recipe;
    data['books/'+founder+'/recipes/sofia-book-state']={kind:'sofia-book-state',revision:1,updatedAt:stamp()};
    localStorage.setItem(dbKey,JSON.stringify(data));
  }
  // Upgrade only this browser's demo fixtures; real Firebase is never accessed.
  for(const key of Object.keys(data).filter(key=>key.startsWith('profiles/'))){
    const uid=key.slice(9),profile=data[key];
    if(!profile.memberId){let id=uid===founder?'10000001':uid==='demo-friend-001'?'10000002':String(10000000+Math.floor(Math.random()*90000000));while(data['members/'+id])id=String(10000000+Math.floor(Math.random()*90000000));profile.memberId=id;}
    data['members/'+profile.memberId]={ownerId:uid,displayName:profile.displayName,searchName:profile.displayName.toLowerCase()};
  }
  localStorage.setItem(dbKey,JSON.stringify(data));
  function reload(){data=JSON.parse(localStorage.getItem(dbKey)||'{}');accounts=JSON.parse(localStorage.getItem(accountKey)||'{}');}
  function publicUser(account){if(!account)return null;const {passwordHash,...user}=account;return user;}
  const auth={currentUser:publicUser(Object.values(accounts).find(a=>a.uid===sessionStorage.getItem(sessionKey)))},authListeners=new Set(),listeners=new Set();
  function denied(){return Object.assign(new Error('示範資料沒有此操作權限。'),{code:'permission-denied'});}
  function canReadBook(id){return auth.currentUser&&(auth.currentUser.uid===id||data['books/'+id]?.visibility==='members');}
  function permit(ref,operation,next){const parts=ref.path.split('/'),uid=auth.currentUser?.uid;if(!uid)throw denied();
    if(parts[0]==='recipes'){if(operation!=='read'||uid!==founder)throw denied();return;}
    if(parts[0]==='profiles'&&parts.length===2){if(operation==='read')return;if(uid===parts[1]&&next?.displayName&&next.displayName.length<=40)return;throw denied();}
    if(parts[0]==='members'&&parts.length===2){if(operation==='read')return;if(operation==='write'&&next?.ownerId===uid&&(!data[ref.path]||data[ref.path].ownerId===uid))return;throw denied();}
    if(parts[0]==='books'&&parts.length===2){if(operation==='read'){if(canReadBook(parts[1]))return;}else if(uid===parts[1]&&next?.ownerId===uid&&['private','members'].includes(next.visibility))return;throw denied();}
    if(parts[0]==='books'&&parts[2]==='recipes'){if(operation==='read'){if(canReadBook(parts[1]))return;}else if(uid===parts[1]&&data['books/'+parts[1]]){if(operation==='delete'&&parts[3]==='sofia-book-state')throw denied();return;}throw denied();}
    throw denied();
  }
  function docSnapshot(ref){permit(ref,'read');const value=clone(data[ref.path]);return {id:ref.path.split('/').at(-1),exists:()=>value!==undefined,data:()=>clone(value),metadata:{fromCache:false,hasPendingWrites:false}};}
  function collectionSnapshot(ref){const parts=ref.path.split('/');if(parts[0]==='members'){if(!auth.currentUser||!ref.constraints?.some(c=>c.kind==='limit'&&c.value<=20))throw denied();}else if(parts[0]==='recipes'){if(auth.currentUser?.uid!==founder)throw denied();}else if(parts[0]!=='books'||parts[2]!=='recipes'||!canReadBook(parts[1]))throw denied();
    const prefix=ref.path+'/';let docs=Object.keys(data).filter(key=>key.startsWith(prefix)&&!key.slice(prefix.length).includes('/')).map(key=>docSnapshot({path:key}));
    const constraints=ref.constraints||[],field=constraints.find(c=>c.kind==='orderBy')?.value;
    if(field)docs.sort((a,b)=>a.data()[field]<b.data()[field]?-1:a.data()[field]>b.data()[field]?1:a.id.localeCompare(b.id));
    for(const c of constraints){if(c.kind==='startAt')docs=docs.filter(d=>d.data()[field]>=c.value);if(c.kind==='endAt')docs=docs.filter(d=>d.data()[field]<=c.value);if(c.kind==='startAfter'){const at=docs.findIndex(d=>d.id===c.value.id);docs=docs.slice(at+1);}}
    const cap=constraints.find(c=>c.kind==='limit');if(cap)docs=docs.slice(0,cap.value);
    return {metadata:{fromCache:false,hasPendingWrites:false},docs};}
  function notify(){for(const entry of listeners){queueMicrotask(()=>{if(!listeners.has(entry))return;try{entry.next(entry.ref.kind==='collection'?collectionSnapshot(entry.ref):docSnapshot(entry.ref));}catch(error){entry.error?.(error);}});}}
  function authNotify(){for(const fn of authListeners)queueMicrotask(()=>fn(auth.currentUser));notify();}
  const sdk={demo:true,initializeApp:()=>({}),getAuth:()=>auth,getFirestore:()=>({}),browserSessionPersistence:'session',setPersistence:async()=>{},
    onAuthStateChanged(authObject,next){authListeners.add(next);queueMicrotask(()=>next(auth.currentUser));return()=>authListeners.delete(next);},
    async signInWithEmailAndPassword(authObject,email,password){reload();const account=accounts[email.toLowerCase()];if(!account||account.passwordHash!==await hash(password))throw Object.assign(new Error('登入失敗'),{code:'auth/invalid-credential'});auth.currentUser=publicUser(account);sessionStorage.setItem(sessionKey,account.uid);authNotify();return {user:auth.currentUser};},
    async createUserWithEmailAndPassword(authObject,email,password){reload();email=email.toLowerCase();if(accounts[email])throw Object.assign(new Error('已註冊'),{code:'auth/email-already-in-use'});const account={uid:'demo-'+crypto.randomUUID(),email,displayName:'',passwordHash:await hash(password)};accounts[email]=account;localStorage.setItem(accountKey,JSON.stringify(accounts));auth.currentUser=publicUser(account);sessionStorage.setItem(sessionKey,account.uid);authNotify();return {user:auth.currentUser};},
    async updateProfile(user,patch){reload();const account=accounts[user.email];Object.assign(account,patch);localStorage.setItem(accountKey,JSON.stringify(accounts));Object.assign(user,patch);if(auth.currentUser?.uid===user.uid)Object.assign(auth.currentUser,patch);},
    async signOut(){auth.currentUser=null;sessionStorage.removeItem(sessionKey);authNotify();},
    async sendPasswordResetEmail(){return;},
    doc:(db,...parts)=>({kind:'doc',path:parts.join('/')}),collection:(db,...parts)=>({kind:'collection',path:parts.join('/')}),serverTimestamp:stamp,
    query:(ref,...constraints)=>({...ref,constraints}),orderBy:value=>({kind:'orderBy',value}),startAt:value=>({kind:'startAt',value}),endAt:value=>({kind:'endAt',value}),startAfter:value=>({kind:'startAfter',value}),limit:value=>({kind:'limit',value}),
    async getDoc(ref){reload();return docSnapshot(ref);},async getDocsFromServer(ref){reload();return collectionSnapshot(ref);},
    onSnapshot(ref,...args){const next=args.find(x=>typeof x==='function'),index=args.indexOf(next),error=args[index+1];const entry={ref,next,error};listeners.add(entry);notify();return()=>listeners.delete(entry);},
    async runTransaction(db,callback){
      reload();const before=JSON.stringify(data),operations=[];
      await callback({get:async ref=>docSnapshot(ref),set:(ref,value)=>operations.push({ref,value:clone(value),kind:'set'}),update:(ref,value)=>operations.push({ref,value:clone(value),kind:'update'}),delete:ref=>operations.push({ref,kind:'delete'})});
      reload();if(JSON.stringify(data)!==before)throw new Error('示範資料已更新，請再試一次。');
      for(const op of operations){const next=op.kind==='update'?{...data[op.ref.path],...op.value}:op.value;permit(op.ref,op.kind==='delete'?'delete':'write',next);}
      for(const op of operations){if(op.kind==='delete')delete data[op.ref.path];else data[op.ref.path]=op.kind==='update'?{...data[op.ref.path],...op.value}:op.value;}
      localStorage.setItem(dbKey,JSON.stringify(data));notify();
    }
  };
  addEventListener('storage',event=>{if(event.key===dbKey){reload();notify();}});
  return sdk;
};
