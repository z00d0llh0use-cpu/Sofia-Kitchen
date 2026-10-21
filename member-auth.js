(() => {
  const M=Member,page=document.body.dataset.page,form=document.querySelector('form'),button=document.querySelector('button[type="submit"]');
  let busy=false;
  function setBusy(on){busy=on;button.disabled=on;form.querySelectorAll('input').forEach(input=>input.disabled=on);}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const email=M.$('email').value.trim(),password=M.$('password')?.value||'';
    if(page==='register'){
      try{M.cleanName(M.$('nickname').value);}catch(error){M.message('authMessage',error.message,true);return;}
      if(password.length<8){M.message('authMessage','密碼至少需要 8 個字元。',true);return;}
      if(password!==M.$('confirmPassword').value){M.message('authMessage','兩次輸入的密碼不一致。',true);return;}
    }
    setBusy(true);M.message('authMessage',page==='forgot'?'正在處理重設密碼要求…':'正在連接帳號…');
    try{
      const s=await M.init();
      if(page==='forgot'){
        try{await s.sdk.sendPasswordResetEmail(s.auth,email);}catch(error){if(!String(error.code).includes('user-not-found'))throw error;}
        M.message('authMessage',s.sdk.demo?'示範：已模擬送出重設要求，沒有寄送郵件。':'若該信箱可接收重設郵件，請查看收件匣與垃圾郵件。設定新密碼後，再回到登入頁。');
        form.reset();
      }else if(page==='register'){
        const nickname=M.cleanName(M.$('nickname').value);
        const result=await s.sdk.createUserWithEmailAndPassword(s.auth,email,password);
        await s.sdk.updateProfile(result.user,{displayName:nickname});
        // Home also retries account creation if network fails after Authentication succeeds.
        try{await M.ensureAccount(result.user,nickname);}catch{}
        location.replace('./index.html');
      }else{
        await s.sdk.signInWithEmailAndPassword(s.auth,email,password);
        location.replace(M.safeNext(new URLSearchParams(location.search).get('next')));
      }
    }catch(error){M.message('authMessage',M.errorText(error),true);}
    finally{if(M.$('password'))M.$('password').value='';if(M.$('confirmPassword'))M.$('confirmPassword').value='';setBusy(false);}
  });
  M.init().then(async()=>{
    if(page!=='forgot'&&!busy){const user=await M.session();if(user&&!busy)location.replace('./index.html');}
    button.disabled=false;
  }).catch(error=>M.message('authMessage',M.errorText(error),true));
})();
