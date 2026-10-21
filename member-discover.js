(() => {
  const M=Member;let user=null,busy=false,cursor=null,activeTerm='',generation=0;
  function result(entry,id){
    const link=document.createElement('a');link.className='member-result';link.href='./profile.html?id='+encodeURIComponent(id);
    const avatar=document.createElement('span');avatar.className='member-avatar';avatar.textContent=Array.from(entry.displayName)[0]||'✦';avatar.setAttribute('aria-hidden','true');
    const info=document.createElement('span'),name=document.createElement('strong'),number=document.createElement('small');
    name.textContent=entry.displayName;number.textContent='會員編號 '+id;info.append(name,number);
    const arrow=document.createElement('span');arrow.textContent='查看個人頁面 ↗';arrow.className='result-action';link.append(avatar,info,arrow);return link;
  }
  async function search(append=false){
    if(!user||busy)return;
    const term=append?activeTerm:M.$('memberSearch').value.trim();
    if(!term||term.length>40){M.message('searchMessage','請輸入暱稱開頭或完整的 8 位數會員編號。',true);return;}
    busy=true;M.$('searchButton').disabled=true;M.$('loadMore').hidden=true;
    const stamp=++generation;
    if(!append){cursor=null;activeTerm=term;M.$('searchResults').replaceChildren();}
    try{
      const {sdk,db}=M.state;let entries=[];
      if(/^[1-9][0-9]{7}$/.test(activeTerm)){
        const found=await sdk.getDoc(sdk.doc(db,'members',activeTerm));if(found.exists())entries=[found];
      }else{
        const name=M.searchName(activeTerm),parts=[sdk.orderBy('searchName'),sdk.startAt(name),sdk.endAt(name+'\uf8ff'),sdk.limit(20)];
        if(cursor)parts.push(sdk.startAfter(cursor));
        const found=await sdk.getDocsFromServer(sdk.query(sdk.collection(db,'members'),...parts));entries=found.docs;
        cursor=entries.at(-1)||null;M.$('loadMore').hidden=entries.length<20;
      }
      if(stamp!==generation||M.state.auth.currentUser?.uid!==user.uid)return;
      for(const entry of entries)M.$('searchResults').append(result(entry.data(),entry.id));
      M.message('searchMessage',entries.length?(append?'已載入更多會員。':'找到以下會員，點擊即可查看。'):(append?'已顯示全部結果。':'找不到會員。請確認編號，或試著輸入較短的暱稱開頭。'));
    }catch(error){if(stamp===generation)M.message('searchMessage',M.errorText(error),true);}
    finally{busy=false;M.$('searchButton').disabled=false;}
  }
  M.$('searchForm').addEventListener('submit',event=>{event.preventDefault();search();});
  M.$('loadMore').addEventListener('click',()=>search(true));
  (async()=>{try{
    user=await M.protect();if(!user)return;
    await M.ensureAccount(user);
    M.$('discoverContent').hidden=false;M.$('loading').hidden=true;
    M.state.sdk.onAuthStateChanged(M.state.auth,next=>{if(!next||next.uid!==user.uid){generation++;M.$('discoverContent').hidden=true;M.$('searchResults').replaceChildren();M.requireLogin();}});
  }catch(error){M.message('searchMessage',M.errorText(error),true);}})();
})();
