// Optional emulator tests; never connect these tests to a real Firebase project.
import {before,after,test} from 'node:test';
import fs from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,collection,Timestamp,writeBatch,query,limit,orderBy,startAt,endAt} from 'firebase/firestore';
let env;
const founder='DipeHVpohTZh6gsaguD5oTgNV0D2';
const recipe={id:'test-recipe',title:'測試料理',category:'chinese',time:'10 分鐘',mood:'',emoji:'',imageUrl:'',ingredients:[],prePrep:'',steps:[],tip:''};
before(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('請使用 Firestore Emulator 執行此測試。');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env=await initializeTestEnvironment({projectId:'demo-sofia-members',firestore:{host,port:Number(port),rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const uid of [founder,'alice','bob']){
      await setDoc(doc(db,'profiles',uid),{displayName:uid,createdAt:Timestamp.now()});
      await setDoc(doc(db,'books',uid),{ownerId:uid,title:'test',visibility:uid===founder?'members':'private',template:'sofia-v1',createdAt:Timestamp.now()});
      await setDoc(doc(db,'books',uid,'recipes',recipe.id),recipe);
    }
    await setDoc(doc(db,'recipes','legacy'),{title:'舊資料'});
  });
});
after(async()=>{await env?.cleanup();});
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
test('anonymous users cannot read member recipes',()=>assertFails(getDoc(doc(db(), 'books',founder,'recipes',recipe.id))));
test('members can read founder shared recipes',()=>assertSucceeds(getDoc(doc(db('alice'),'books',founder,'recipes',recipe.id))));
test('members cannot modify founder recipes',()=>assertFails(updateDoc(doc(db('alice'),'books',founder,'recipes',recipe.id),{title:'改動'})));
test('owners can query own recipe collection',()=>assertSucceeds(getDocs(collection(db('alice'),'books','alice','recipes'))));
test('another member cannot read a private book',()=>assertFails(getDoc(doc(db('bob'),'books','alice','recipes',recipe.id))));
test('founder account also cannot read another private book',()=>assertFails(getDoc(doc(db(founder),'books','alice','recipes',recipe.id))));
test('owner can create a recipe',()=>assertSucceeds(setDoc(doc(db('alice'),'books','alice','recipes','new-recipe'),{...recipe,id:'new-recipe'})));
test('another member cannot create recipes in private book',()=>assertFails(setDoc(doc(db('bob'),'books','alice','recipes','intruder'),{...recipe,id:'intruder'})));
test('owner cannot transfer ownerId through title settings',()=>assertFails(updateDoc(doc(db('alice'),'books','alice'),{ownerId:'bob'})));
test('profile cannot grant itself admin role',()=>assertFails(updateDoc(doc(db('alice'),'profiles','alice'),{admin:true})));
test('profile cannot store public email field',()=>assertFails(updateDoc(doc(db('alice'),'profiles','alice'),{email:'private@example.com'})));
test('profile list access is denied',()=>assertFails(getDocs(collection(db('alice'),'profiles'))));
test('legacy data is no longer publicly readable',()=>assertFails(getDocs(collection(db(),'recipes'))));
test('other members cannot read legacy data',()=>assertFails(getDocs(collection(db('alice'),'recipes'))));
test('founder can read legacy migration source',()=>assertSucceeds(getDocs(collection(db(founder),'recipes'))));
test('legacy data cannot be overwritten during migration',()=>assertFails(setDoc(doc(db(founder),'recipes','legacy'),{title:'changed'})));
test('version metadata cannot be deleted',async()=>{
  await assertSucceeds(setDoc(doc(db('alice'),'books','alice','recipes','sofia-book-state'),{kind:'sofia-book-state',revision:1,updatedAt:Timestamp.now()}));
  await assertFails(deleteDoc(doc(db('alice'),'books','alice','recipes','sofia-book-state')));
});
test('profile and unique directory ID can be created atomically',async()=>{
  const d=db('new-member'),batch=writeBatch(d);
  batch.set(doc(d,'profiles','new-member'),{displayName:'Sofia Friend',memberId:'12345678',createdAt:Timestamp.now()});
  batch.set(doc(d,'members','12345678'),{ownerId:'new-member',displayName:'Sofia Friend',searchName:'sofia friend'});
  await assertSucceeds(batch.commit());
});
test('anonymous visitors cannot query or get member directory',async()=>{
  await assertFails(getDoc(doc(db(),'members','12345678')));
  await assertFails(getDocs(query(collection(db(),'members'),limit(20))));
});
test('bounded nickname prefix search is allowed for signed-in members',()=>assertSucceeds(getDocs(query(collection(db('alice'),'members'),orderBy('searchName'),startAt('so'),endAt('so\uf8ff'),limit(20)))));
test('unbounded directory queries and oversized page sizes are denied',async()=>{
  await assertFails(getDocs(collection(db('alice'),'members')));
  await assertFails(getDocs(query(collection(db('alice'),'members'),limit(21))));
});
test('another member cannot overwrite or delete an allocated ID',async()=>{
  await assertFails(setDoc(doc(db('bob'),'members','12345678'),{ownerId:'bob',displayName:'Bob',searchName:'bob'}));
  await assertFails(deleteDoc(doc(db('new-member'),'members','12345678')));
});
test('cannot create standalone IDs without matching profile',()=>assertFails(setDoc(doc(db('alice'),'members','87654321'),{ownerId:'alice',displayName:'Alice',searchName:'alice'})));
test('existing member cannot claim a second ID or change its ID',async()=>{
  const d=db('new-member'),batch=writeBatch(d);
  batch.update(doc(d,'profiles','new-member'),{memberId:'12345679'});
  batch.set(doc(d,'members','12345679'),{ownerId:'new-member',displayName:'Sofia Friend',searchName:'sofia friend'});
  await assertFails(batch.commit());
});
test('nickname update must atomically update the search directory',async()=>{
  const d=db('new-member');
  await assertFails(updateDoc(doc(d,'profiles','new-member'),{displayName:'New Nickname'}));
  const batch=writeBatch(d);batch.update(doc(d,'profiles','new-member'),{displayName:'New Nickname'});
  batch.update(doc(d,'members','12345678'),{displayName:'New Nickname',searchName:'new nickname'});
  await assertSucceeds(batch.commit());
});
test('directory rejects private email and untrusted extra data',()=>assertFails(updateDoc(doc(db('new-member'),'members','12345678'),{email:'not-public@example.test'})));
test('legacy profile can migrate once while preserving createdAt',async()=>{
  const d=db('alice'),batch=writeBatch(d);batch.update(doc(d,'profiles','alice'),{memberId:'87654321'});
  batch.set(doc(d,'members','87654321'),{ownerId:'alice',displayName:'alice',searchName:'alice'});
  await assertSucceeds(batch.commit());
});
test('eight digit ID cannot collide across concurrent owners',async()=>{
  const claim=uid=>{const d=db(uid),batch=writeBatch(d);batch.set(doc(d,'profiles',uid),{displayName:uid,memberId:'55555555',createdAt:Timestamp.now()});batch.set(doc(d,'members','55555555'),{ownerId:uid,displayName:uid,searchName:uid});return batch.commit();};
  const outcomes=await Promise.allSettled([claim('racer-a'),claim('racer-b')]);
  if(outcomes.filter(result=>result.status==='fulfilled').length!==1)throw new Error('Exactly one owner must acquire the ID');
});
