(() => {
  const M=Member;let stop=()=>{};
  function unavailable(text){M.$('sharedBook').hidden=true;M.$('sharedTitle').textContent='';M.$('sharedBookLink').removeAttribute('href');M.message('profileMessage',text);}
  (async()=>{try{
    const user=await M.protect();if(!user)return;
    const id=new URLSearchParams(location.search).get('id')||'';
    if(!/^[1-9][0-9]{7}$/.test(id))throw new Error('會員連結無效，請回到搜尋頁重新選擇。');
    const {sdk,db}=M.state,entry=await sdk.getDoc(sdk.doc(db,'members',id));
    if(!entry.exists())throw new Error('找不到這位會員。舊帳號需先登入新版，才會出現在搜尋結果。');
    const member=entry.data();M.$('profileName').textContent=member.displayName;M.$('profileNumber').textContent=id;
    M.$('profileAvatar').textContent=Array.from(member.displayName)[0]||'✦';
    M.$('profileContent').hidden=false;M.$('loading').hidden=true;
    M.message('profileMessage','正在確認食譜本分享範圍…');
    stop=sdk.onSnapshot(sdk.doc(db,'books',member.ownerId),snapshot=>{
      if(M.state.auth.currentUser?.uid!==user.uid)return;
      if(!snapshot.exists()){unavailable('這位會員尚未建立食譜本。');return;}
      const book=snapshot.data(),own=member.ownerId===user.uid;
      if(!own&&book.visibility!=='members'){unavailable('這位會員的食譜本目前設為私人。');return;}
      M.$('sharedTitle').textContent=book.title;M.$('sharedBookLink').href='./book.html?owner='+encodeURIComponent(member.ownerId);
      M.$('sharedBookLink').textContent=own?'打開我的食譜本 ↗':'閱讀食譜本 ↗';
      M.$('sharedBook').hidden=false;M.message('profileMessage',own?'這是你的個人頁面。':'對方分享的食譜只供閱讀，只有擁有者可以修改。');
    },error=>{
      unavailable(String(error?.code).includes('permission-denied')?'這位會員的食譜本目前設為私人，或已停止分享。':M.errorText(error));
    });
    sdk.onAuthStateChanged(M.state.auth,next=>{if(!next||next.uid!==user.uid){stop();M.$('profileContent').hidden=true;unavailable('');M.requireLogin();}});
  }catch(error){M.$('loading').hidden=true;M.message('profileMessage',M.errorText(error),true);}})();
  addEventListener('pagehide',()=>stop());
})();
