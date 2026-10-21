(() => {
  const M=Member;let busy=false;
  async function start(){
    try{
      const user=await M.protect();if(!user)return;
      const {sdk,db,settings}=M.state;
      const account=await M.ensureAccount(user);
      M.$('welcomeName').textContent=account.profile.displayName;
      M.$('myMemberId').textContent=account.profile.memberId;
      M.$('myProfileLink').href='./profile.html?id='+account.profile.memberId;
      M.$('nickname').value=account.profile.displayName;
      M.$('bookTitle').value=account.book.title;
      M.$('visibility').value=account.book.visibility;
      M.$('myBookTitle').textContent=account.book.title;
      M.$('myBookLink').href='./book.html?owner='+encodeURIComponent(user.uid);
      M.$('myPrivacy').textContent=account.book.visibility==='members'?'會員可閱讀，只有你能修改':'私人保存，只有你能讀寫';
      M.$('founderLink').href='./book.html?owner='+encodeURIComponent(settings.founderUid);
      if(user.uid===settings.founderUid){M.$('founderDescription').textContent='這是你分享給會員閱讀的入口。你可以在個人設定調整分享範圍。';}
      M.$('loading').hidden=true;M.$('homeContent').hidden=false;
      sdk.onAuthStateChanged(M.state.auth,next=>{if(!next||next.uid!==user.uid){M.$('homeContent').hidden=true;M.requireLogin();}});
    }catch(error){M.message('homeMessage',M.errorText(error),true);M.$('loading').textContent='尚未完成載入';}
  }
  M.$('logoutButton').addEventListener('click',()=>{if(!busy)M.logout().catch(error=>M.message('homeMessage',M.errorText(error),true));});
  M.$('settingsForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const s=M.state,user=s.auth.currentUser;if(!user){M.requireLogin();return;}
    try{
      const name=M.cleanName(M.$('nickname').value),title=M.$('bookTitle').value.trim(),visibility=M.$('visibility').value;
      if(!title||title.length>80)throw new Error('食譜本名稱請填寫 1～80 個字元。');
      if(!['private','members'].includes(visibility))throw new Error('請選擇有效的分享範圍。');
      busy=true;M.$('saveSettings').disabled=true;
      const sdk=s.sdk;
      await sdk.runTransaction(s.db,async tx=>{
        const profileRef=sdk.doc(s.db,'profiles',user.uid),bookRef=sdk.doc(s.db,'books',user.uid);
        const [profile,book]=await Promise.all([tx.get(profileRef),tx.get(bookRef)]);
        if(!profile.exists()||!book.exists())throw new Error('帳號資料尚未建立，請重新整理後再試。');
        tx.update(profileRef,{displayName:name});tx.update(bookRef,{title,visibility});
        tx.set(sdk.doc(s.db,'members',profile.data().memberId),{ownerId:user.uid,displayName:name,searchName:M.searchName(name)});
      });
      // Auth displayName is a convenience only; Firestore profile is the display source.
      try{await sdk.updateProfile(user,{displayName:name});}catch{}
      M.$('welcomeName').textContent=name;M.$('myBookTitle').textContent=title;
      M.$('myPrivacy').textContent=visibility==='members'?'會員可閱讀，只有你能修改':'私人保存，只有你能讀寫';
      M.message('settingsMessage','個人設定已儲存。');
    }catch(error){M.message('settingsMessage',M.errorText(error),true);}
    finally{busy=false;M.$('saveSettings').disabled=false;}
  });
  start();
})();
