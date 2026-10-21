/* Shared account and document helpers. Recipe contents never enter browser storage. */
window.Member = (() => {
  const state={sdk:null,auth:null,db:null,user:null,settings:null,initial:null};
  const $=id=>document.getElementById(id);
  function errorText(error){
    const code=String(error?.code||'');
    if(code.includes('permission-denied'))return '目前的資料庫規則尚未開放會員版，或你沒有這本食譜的權限。請查看套件內的更新步驟。';
    if(code.includes('email-already-in-use'))return '這個電子郵件已註冊，請登入或重設密碼。';
    if(code.includes('weak-password'))return '密碼強度不足，請使用至少 8 個字元。';
    if(code.includes('invalid-email'))return '請填寫有效的電子郵件。';
    if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return '登入失敗，請確認電子郵件與密碼。';
    if(code.includes('operation-not-allowed'))return '請先在 Firebase Authentication 啟用 Email/Password。';
    if(code.includes('unauthorized-domain'))return '目前網址尚未獲准登入，請在 Authentication 的 Authorized domains 加入目前網域。';
    if(code.includes('too-many-requests'))return '操作過於頻繁，請稍後再試。';
    if(code.includes('unavailable')||code.includes('network-request-failed'))return '無法連線，請確認網路後再試。';
    return error?.message||'操作失敗，請稍後再試。';
  }
  async function init(){
    if(state.initial)return state.initial;
    state.initial=(async()=>{
      if(location.protocol==='file:')throw new Error('請使用套件內的本機預覽啟動檔，或透過 Hosting 網址開啟。');
      state.settings=window.SOFIA_FIREBASE_SETTINGS;
      if(!state.settings?.firebaseConfig?.projectId||!state.settings.founderUid)throw new Error('找不到 Firebase 設定檔。');
      if(window.SOFIA_DEMO_LOADER)state.sdk=await window.SOFIA_DEMO_LOADER();
      else {
        const parts=await Promise.all(['app','auth','firestore'].map(name=>import('https://www.gstatic.com/firebasejs/13.0.0/firebase-'+name+'.js')));
        state.sdk=Object.assign({},...parts);
      }
      const sdk=state.sdk,app=sdk.initializeApp(state.settings.firebaseConfig,'sofia-kitchen-members-v1');
      state.auth=sdk.getAuth(app);state.db=sdk.getFirestore(app);
      await sdk.setPersistence(state.auth,sdk.browserSessionPersistence);
      if(sdk.demo){
        const banner=document.createElement('div');banner.className='demo-banner';banner.textContent='本機示範模式 · 不連接 Firebase，也不會寄送郵件';document.body.prepend(banner);
        document.documentElement.classList.add('demo-mode');
      }
      return state;
    })();return state.initial;
  }
  async function session(){
    await init();
    const user=await new Promise((resolve,reject)=>{
      let stop=()=>{};
      stop=state.sdk.onAuthStateChanged(state.auth,user=>{state.user=user;resolve(user);setTimeout(()=>stop(),0)},reject);
    });return user;
  }
  function safeNext(raw){
    const base=new URL('./',location.href);
    try{const url=new URL(raw||'./index.html',base);const pages=['index.html','book.html','discover.html','profile.html'];
      if(url.origin===base.origin&&pages.some(page=>url.pathname===base.pathname+page))return url.pathname+url.search;
    }catch{}
    return base.pathname+'index.html';
  }
  function requireLogin(){location.replace('./login.html?next='+encodeURIComponent(safeNext(location.pathname+location.search)));}
  async function protect(){const user=await session();if(!user){requireLogin();return null;}return user;}
  function nameOf(user){return user?.displayName?.trim()||(user?.uid===state.settings?.founderUid?'Sofia':'料理新朋友');}
  function cleanName(value){const name=String(value||'').trim();if(!name||name.length>40)throw new Error('暱稱請填寫 1～40 個字元。');return name;}
  function searchName(name){return cleanName(name).toLowerCase();}
  function memberNumber(){const values=new Uint32Array(1);do{crypto.getRandomValues(values);}while(values[0]>=4230000000);return String(10000000+values[0]%90000000);}
  async function ensureAccount(user,requestedName){
    const sdk=state.sdk,name=cleanName(requestedName||nameOf(user));
    const profileRef=sdk.doc(state.db,'profiles',user.uid),bookRef=sdk.doc(state.db,'books',user.uid);
    for(let attempt=0;attempt<12;attempt++){
    try{await sdk.runTransaction(state.db,async tx=>{
      const [profile,book]=await Promise.all([tx.get(profileRef),tx.get(bookRef)]);
      const old=profile.exists()?profile.data():null;
      const memberId=old?.memberId||memberNumber(),displayName=old?.displayName||name;
      const directoryRef=sdk.doc(state.db,'members',memberId),entry=await tx.get(directoryRef);
      if(entry.exists()&&entry.data().ownerId!==user.uid){if(old?.memberId)throw new Error('會員編號資料不一致，請聯絡網站管理者。');throw Object.assign(new Error('編號已使用'),{code:'member-id-collision'});}
      if(!old)tx.set(profileRef,{displayName,memberId,createdAt:sdk.serverTimestamp()});
      else if(!old.memberId)tx.update(profileRef,{memberId});
      if(!entry.exists()||entry.data().displayName!==displayName)tx.set(directoryRef,{ownerId:user.uid,displayName,searchName:searchName(displayName)});
      if(!book.exists())tx.set(bookRef,{ownerId:user.uid,title:name+'的食譜本',visibility:user.uid===state.settings.founderUid?'members':'private',template:'sofia-v1',createdAt:sdk.serverTimestamp()});
    });break;}catch(error){if(error.code!=='member-id-collision'||attempt===11)throw error;}
    }
    const [profile,book]=await Promise.all([sdk.getDoc(profileRef),sdk.getDoc(bookRef)]);
    return {profile:profile.data(),book:book.data()};
  }
  async function logout(){await state.sdk.signOut(state.auth);state.user=null;location.replace('./login.html');}
  function message(id,text,bad=false){const node=$(id);if(node){node.textContent=text;node.classList.toggle('error',bad);}}
  return {state,$,init,session,protect,ensureAccount,logout,errorText,safeNext,nameOf,cleanName,searchName,message};
})();
