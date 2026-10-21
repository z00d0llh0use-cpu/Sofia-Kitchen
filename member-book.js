        // Firebase connection: data stays in Firestore; session memory is not a cloud backup.
        const BOOK_STATE_ID = 'sofia-book-state';
        const MAX_CLOUD_CHANGES = 400;
        const cloud = {
            sdk:null, db:null, auth:null, user:null, ready:false, confirmed:false,
            hasData:false, revision:0, busy:false, error:'', settings:null,
            unsubscribe:null, undo:null, loginBusy:false, editBase:null,
            deleteBase:null, deleteRevision:null, ownerUid:null, book:null, bookUnsubscribe:null
        };

        function cloudError(error) { return Member.errorText(error); }

        function isCloudEditor() { return !!(cloud.user && cloud.book && cloud.user.uid===cloud.ownerUid && cloud.book.ownerId===cloud.user.uid); }

        function requireCloudEditor() {
            if (!cloud.ready || !cloud.confirmed) { showToast('尚未確認雲端連線，請等候或重新整理後再編輯。'); return false; }
            if (!isCloudEditor()) { showToast('只有授權帳號登入後才能修改食譜。'); return false; }
            if (cloud.busy) { showToast('正在儲存雲端資料，請稍候。'); return false; }
            return true;
        }

        function refreshDataStatus(message = '') {
            let status=message;
            if(!status){
                if(cloud.error)status=cloud.error;
                else if(cloud.busy)status='正在儲存這本食譜至雲端…';
                else if(!cloud.ready)status='正在載入食譜本…';
                else if(!cloud.confirmed)status='尚未取得伺服器確認，目前不能編輯。';
                else status=(cloud.sdk?.demo?'示範資料':'雲端已連線')+' · '+recipes.length+' 道食譜 · '+(isCloudEditor()?'我的食譜本，可編輯':'會員分享，僅供閱讀');
            }
            document.getElementById('dataStatus').textContent=status;
            document.body.classList.toggle('cloud-readonly',!isCloudEditor()||!cloud.confirmed);
            document.body.classList.toggle('cloud-saving',cloud.busy);
            document.getElementById('cloudAccount').textContent=cloud.user?'目前登入：'+Member.nameOf(cloud.user):'尚未登入';
            document.getElementById('cloudLogoutBtn').hidden=!cloud.user;
            document.getElementById('cloudLogoutBtn').disabled=cloud.busy;
            document.querySelectorAll('#recipeForm input, #recipeForm textarea, #recipeForm select, #recipeForm button, #confirmDeleteBtn, #applyImportBtn').forEach(el=>el.disabled=cloud.busy);
            document.getElementById('undoImportBtn').hidden=!cloud.undo||cloud.undo.revision!==cloud.revision||!isCloudEditor();
            document.getElementById('migrateLegacyButton').hidden=!(isCloudEditor()&&cloud.ownerUid===cloud.settings?.founderUid&&cloud.confirmed);
        }


        function receiveCloudSnapshot(snapshot) {
            if (snapshot.metadata.hasPendingWrites) return;
            try {
                const list=[];
                let revision=0;
                snapshot.docs.forEach(item => {
                    if(item.id === BOOK_STATE_ID) {
                        const state=item.data();
                        if(state.kind !== 'sofia-book-state' || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('雲端版本資料格式不符，請檢查 sofia-book-state 文件。');
                        revision=state.revision;
                    } else list.push({...item.data(),id:item.id});
                });
                const normalized=validateRecipeData(list);
                cloud.confirmed=!snapshot.metadata.fromCache;
                // Do not replace already-confirmed content with an older cache snapshot.
                if (!snapshot.metadata.fromCache || !cloud.hasData) {
                    recipes=normalized;
                    cloud.revision=revision;
                    cloud.hasData=true;
                    currentSpreadIndex=Math.min(currentSpreadIndex, Math.max(0,getTotalSpreads()-1));
                    updateBookView();
                }
                cloud.error='';
                refreshDataStatus();
            } catch(error) {
                cloud.confirmed=false;
                cloud.error='雲端資料無法顯示：'+cloudError(error);
                refreshDataStatus();
            }
        }

        async function loadRecipes() {
            recipes=[];
            refreshDataStatus();
            const gate=document.getElementById('sessionGate'),workspace=document.getElementById('bookWorkspace');
            function lock(message){
                cloud.unsubscribe?.();cloud.bookUnsubscribe?.();
                cloud.confirmed=false;cloud.ready=false;cloud.error=message;recipes=[];cloud.hasData=false;
                workspace.hidden=true;gate.hidden=false;gate.textContent=message;
                const a=document.createElement('a');a.href='./index.html';a.textContent=' 返回首頁';a.style.textDecoration='underline';gate.appendChild(a);
                refreshDataStatus();
            }
            try{
                const user=await Member.protect();if(!user)return;
                const s=Member.state;cloud.sdk=s.sdk;cloud.db=s.db;cloud.auth=s.auth;cloud.user=user;cloud.settings=s.settings;
                await Member.ensureAccount(user);
                const ownerUid=new URLSearchParams(location.search).get('owner')||user.uid;
                if(!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid))throw new Error('食譜本網址不正確。');
                cloud.ownerUid=ownerUid;
                const bookRef=s.sdk.doc(s.db,'books',ownerUid);
                const book=await s.sdk.getDoc(bookRef);
                if(!book.exists())throw new Error('這本食譜尚未建立。請先返回首頁。');
                cloud.book=book.data();
                if(cloud.book.ownerId!==ownerUid)throw new Error('食譜擁有者資料不符。');
                if(user.uid!==ownerUid&&cloud.book.visibility!=='members')throw new Error('這本食譜目前是私人內容。');
                function titleBook(data){
                    document.getElementById('activeBookTitle').textContent=data.title;
                    const cover=document.getElementById('bookCoverTitle');if(cover)cover.textContent=data.title;
                    document.title=data.title+' · Sofia Kitchen';
                }
                titleBook(cloud.book);cloud.ready=true;gate.hidden=true;workspace.hidden=false;refreshDataStatus();
                cloud.unsubscribe=s.sdk.onSnapshot(s.sdk.collection(s.db,'books',ownerUid,'recipes'),{includeMetadataChanges:true},receiveCloudSnapshot,error=>lock(Member.errorText(error)));
                cloud.bookUnsubscribe=s.sdk.onSnapshot(bookRef,snapshot=>{
                    if(!snapshot.exists()){lock('這本食譜已不存在。');return;}
                    const data=snapshot.data();
                    if(user.uid!==ownerUid&&data.visibility!=='members'){lock('擁有者已將這本食譜改為私人。');return;}
                    cloud.book=data;titleBook(data);refreshDataStatus();
                },error=>lock(Member.errorText(error)));
                s.sdk.onAuthStateChanged(s.auth,next=>{
                    if(!next||next.uid!==user.uid){
                        cloud.unsubscribe?.();cloud.bookUnsubscribe?.();recipes=[];workspace.hidden=true;cloud.user=null;Member.requireLogin();
                    }
                });
            }catch(error){lock(Member.errorText(error));}
        }


        function openCloudLogin(){Member.requireLogin();}
        async function logoutCloud(){if(!cloud.busy)await Member.logout();}
        function backToMemberHome(){if(cloud.busy){showToast('正在儲存，請稍候。');return;}location.assign('./index.html');}

        function validateCloudRecipes(list) {
            const normalized=validateRecipeData(list);
            for(const recipe of normalized) {
                if(recipe.id === BOOK_STATE_ID) throw new Error('食譜 id '+BOOK_STATE_ID+' 是系統保留識別碼，請更換。');
                if(recipe.imageUrl.startsWith('data:')) throw new Error('「'+recipe.title+'」包含內嵌照片。此版請先改用圖片網址；JSON 原檔請保留。');
                if(new TextEncoder().encode(JSON.stringify(recipe)).length > 800 * 1024) throw new Error('「'+recipe.title+'」內容過大，請縮短內容後再試。');
            }
            return normalized;
        }

        function planCloudChanges(before,after) {
            const oldMap=new Map(before.map(r=>[r.id,r]));
            const newMap=new Map(after.map(r=>[r.id,r]));
            const sets=after.filter(r=>!oldMap.has(r.id)||JSON.stringify(oldMap.get(r.id))!==JSON.stringify(r));
            const deletes=before.filter(r=>!newMap.has(r.id)).map(r=>r.id);
            if(sets.length+deletes.length>MAX_CLOUD_CHANGES) throw new Error('一次最多變更 400 道食譜。請分批使用「僅新增」或「合併更新」匯入。');
            const bytes=new TextEncoder().encode(JSON.stringify(sets)).length;
            if(bytes>8*1024*1024) throw new Error('這批資料太大，請減少每次匯入的食譜數量。');
            return {sets,deletes};
        }

        async function persistCloudRecipes(next) {
            if(!requireCloudEditor()) return false;
            const before=recipes;
            const expectedRevision=cloud.revision;
            const writerUid=cloud.user.uid;
            let normalized,changes;
            try { normalized=validateCloudRecipes(next); changes=planCloudChanges(before,normalized); }
            catch(error) { showToast(cloudError(error)); setDataMessage(cloudError(error)); return false; }
            if(!changes.sets.length && !changes.deletes.length) return true;
            cloud.busy=true; cloud.error=''; refreshDataStatus();
            try {
                const sdk=cloud.sdk;
                await sdk.runTransaction(cloud.db, async transaction => {
                    const stateRef=sdk.doc(cloud.db,'books',cloud.ownerUid,'recipes',BOOK_STATE_ID);
                    const stateSnap=await transaction.get(stateRef);
                    const revision=stateSnap.exists()?stateSnap.data().revision:0;
                    if(revision!==expectedRevision) throw new Error('其他裝置已更新食譜。請等候同步，重新確認內容後再儲存。');
                    if(cloud.auth.currentUser?.uid!==writerUid) throw new Error('登入帳號已改變，請重新登入後再儲存。');
                    changes.sets.forEach(recipe=>transaction.set(sdk.doc(cloud.db,'books',cloud.ownerUid,'recipes',recipe.id),recipe));
                    changes.deletes.forEach(id=>transaction.delete(sdk.doc(cloud.db,'books',cloud.ownerUid,'recipes',id)));
                    transaction.set(stateRef,{kind:'sofia-book-state',revision:expectedRevision+1,updatedAt:sdk.serverTimestamp()});
                });
                // A resolved transaction is a server acknowledgement, not an optimistic local save.
                if(cloud.revision<=expectedRevision) {
                    recipes=normalized; cloud.revision=expectedRevision+1; cloud.hasData=true;
                    currentSpreadIndex=Math.min(currentSpreadIndex,Math.max(0,getTotalSpreads()-1)); updateBookView();
                }
                return true;
            } catch(error) { const message=cloudError(error); showToast('未儲存：'+message); setDataMessage('未儲存：'+message); return false; }
            finally { cloud.busy=false; refreshDataStatus(); }
        }

        // The local-only writer is deliberately disabled in this cloud edition.
        function saveRecipes() { showToast('此版透過雲端儲存，不能使用舊版的本機儲存流程。'); return false; }

        function openDataManager() {
            setDataMessage(!cloud.hasData ? '尚未讀取雲端食譜。請先確認頁首的連線狀態。' : ('雲端目前共有 '+recipes.length+' 道食譜。'+(isCloudEditor()?'匯入會修改目前這本雲端食譜，請先確認預覽。':'你可以匯出公開食譜；匯入需要編輯者登入。')));
            const dialog=document.getElementById('dataManager'); if(!dialog.open) dialog.showModal();
        }

        function exportRecipes() {
            if(!cloud.hasData) { setDataMessage('尚未讀取雲端資料，無法匯出。'); return; }
            downloadRecipeData(recipes);
            setDataMessage('已發起 '+recipes.length+' 道食譜的 JSON 備份下載，請確認瀏覽器下載清單。'+(cloud.confirmed?'':'這是目前已讀取的內容，尚未確認是否為雲端最新版。'));
        }

        async function saveRecipeFromModal(event) {
            event.preventDefault();
            if(!requireCloudEditor()) return;
            const id=document.getElementById('editRecipeId').value;
            const existing=id?recipes.find(r=>r.id===id):null;
            if(id && (!existing || JSON.stringify(existing)!==cloud.editBase)) { showToast('這道食譜已被更新或刪除。請保留表單文字，關閉後重新開啟比對。'); return; }
            const value=id=>document.getElementById(id).value.trim();
            const category=value('inputCategory');
            if(!Object.hasOwn(CATEGORIES,category)) {showToast('請選擇有效分類');return;}
            const defaultPhotos={chinese:'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',western:'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80',dessert:'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=800&q=80',drink:'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80'};
            const record={id:id||makeRecipeId(),title:value('inputTitle'),category,time:value('inputTime'),mood:value('inputMood')||CATEGORIES[category].desc,emoji:value('inputEmoji')||CATEGORIES[category].icon,imageUrl:value('inputImageUrl')||defaultPhotos[category],ingredients:value('inputIngredients').split('\n').map(x=>x.trim()).filter(Boolean),prePrep:value('inputPrePrep'),steps:value('inputSteps').split('\n').map(x=>x.trim()).filter(Boolean),tip:value('inputTip')};
            const next=id?recipes.map(r=>r.id===id?record:r):[...recipes,record];
            if(await persistCloudRecipes(next)) {
                closeRecipeModal(); showToast(cloud.sdk.demo?'示範食譜已儲存（未上傳 Firebase）':'食譜已保存至雲端');
                const index=getOrderedRecipes().findIndex(r=>r.id===record.id);
                if(index>=0)goToRecipePage(index+1);
            }
        }

        async function confirmCloudDelete() {
            if(!requireCloudEditor() || !pendingDeleteId) return;
            const target=recipes.find(r=>r.id===pendingDeleteId);
            if(!target || JSON.stringify(target)!==cloud.deleteBase) {showToast('這道食譜已更新或刪除，請關閉視窗重新確認。');return;}
            const next=recipes.filter(r=>r.id!==pendingDeleteId);
            if(await persistCloudRecipes(next)) {closeDeleteModal();showToast('已從雲端刪除食譜');}
        }

        async function readImportFile(event) {
            const file=event.target.files?.[0]; event.target.value='';
            if(!file || !requireCloudEditor()) return;
            const sequence=++importReadSequence;
            cancelRecipeImport(false);
            try {
                if(file.size>25*1024*1024) throw new Error('檔案超過 25 MiB。');
                const text=await file.text(); if(sequence!==importReadSequence)return;
                const parsed=JSON.parse(text.replace(/^\uFEFF/,''));
                const list=validateCloudRecipes(Array.isArray(parsed)?parsed:validateRecipeData(parsed));
                pendingImport={name:file.name,recipes:list,revision:cloud.revision};
                document.getElementById('importMode').value='skip';
                document.getElementById('replaceConsent').checked=false;
                document.getElementById('importPreview').hidden=false;
                document.getElementById('importFileSummary').textContent=file.name+' · '+list.length+' 道食譜';
                setDataMessage('格式檢查通過；確認匯入後會修改目前這本雲端食譜。'); updateImportPreview();
            }catch(error){if(sequence!==importReadSequence)return;cancelRecipeImport(false);setDataMessage('未匯入：'+(error instanceof SyntaxError?'JSON 語法錯誤，請檢查雙引號、逗號與括號。':cloudError(error)));}
        }

        async function applyRecipeImport() {
            if(!pendingImport || !requireCloudEditor())return;
            if(pendingImport.revision!==cloud.revision) {
                pendingImport.revision=cloud.revision; updateImportPreview();
                setDataMessage('雲端資料已更新，預覽已重新計算。請再次確認匯入方式與數量。'); return;
            }
            const mode=document.getElementById('importMode').value;
            if(mode==='replace' && !document.getElementById('replaceConsent').checked){setDataMessage('請勾選整本取代的確認框。');return;}
            try {
                const before=recipes.map(r=>({...r}));
                const plan=planRecipeImport(before,pendingImport.recipes,mode);
                planCloudChanges(before,validateCloudRecipes(plan.recipes));
                downloadRecipeData(before,'Sofia雲端匯入前備份');
                if(!await persistCloudRecipes(plan.recipes))return;
                cloud.undo={recipes:before,revision:cloud.revision};
                cancelRecipeImport();currentSpreadIndex=0;updateBookView();refreshDataStatus();
                setDataMessage('已匯入雲端，共 '+recipes.length+' 道食譜。請確認下載清單中的匯入前備份。');showToast('食譜已匯入雲端');
            }catch(error){setDataMessage('未匯入：'+cloudError(error));}
        }

        async function undoLastImport() {
            if(!requireCloudEditor() || !cloud.undo)return;
            if(cloud.undo.revision!==cloud.revision){setDataMessage('匯入後資料已變更，請改用 JSON 備份預覽還原。');return;}
            if(!confirm('將整本雲端食譜還原到剛才匯入前的內容，繼續嗎？'))return;
            downloadRecipeData(recipes,'Sofia雲端復原前備份');
            const before=cloud.undo.recipes;
            if(await persistCloudRecipes(before)){cloud.undo=null;cancelRecipeImport();refreshDataStatus();setDataMessage('已在雲端復原上一次匯入。');}
        }


        async function migrateLegacyRecipes(){
            if(!requireCloudEditor()||cloud.ownerUid!==cloud.settings.founderUid)return;
            if(!confirm('將讀取舊版食譜並先下載備份，再把尚未存在的食譜加入你的新食譜本。舊版資料不會刪除，繼續嗎？'))return;
            try{
                const snapshot=await cloud.sdk.getDocsFromServer(cloud.sdk.collection(cloud.db,'recipes'));
                const legacy=validateRecipeData(snapshot.docs.filter(item=>item.id!==BOOK_STATE_ID).map(item=>({...item.data(),id:item.id})));
                downloadRecipeData(legacy,'Sofia舊版移轉前備份');
                const next=planRecipeImport(recipes,legacy,'skip');
                if(!legacy.length){setDataMessage('舊資料區沒有食譜。你也可以匯入先前下載的 JSON 備份。');return;}
                if(await persistCloudRecipes(next.recipes)){
                    setDataMessage('移轉完成，新增 '+next.added+' 道，略過 '+next.skipped+' 道。舊資料仍保留，請確認備份下載。');
                    showToast('舊版食譜已加入你的個人食譜本');
                }
            }catch(error){setDataMessage('移轉未完成：'+Member.errorText(error)+' 如資料較多，可使用已下載的 JSON 分批匯入。');}
        }
