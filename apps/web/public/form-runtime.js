(() => {
 const root=document.getElementById('form-app');if(!root)return;
 const formId=root.dataset.formId,content=document.getElementById('content'),status=document.getElementById('status');
 const storageKey='form-session:'+formId;let token='',definition,revision=0,answers={},busy=false;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 async function api(path,body){const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',credentials:'omit',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok){const error=new Error(data.error?.message||'Please correct the marked fields.');error.fields=data.errors;throw error;}return data;}
 function button(text,handler,secondary=false){const b=el('button',text);b.type='button';if(secondary)b.className='secondary';b.onclick=()=>run(handler);return b;}
 async function run(fn){if(busy)return;busy=true;status.textContent='';root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(error){status.textContent=error.message;if(error.fields)for(const [key,message]of Object.entries(error.fields)){const target=document.getElementById('error-'+key);if(target)target.textContent=message;} }finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 function heading(data){definition=data.definition;revision=data.revision||0;answers=data.answers||{};document.getElementById('title').textContent=definition.title;document.title=definition.title;document.getElementById('description').textContent=definition.description;document.getElementById('test').hidden=!data.test;document.getElementById('privacy').textContent='Required fields are marked *. Answers are retained for '+definition.retention_days+' days from when you start. You can review and correct them before submitting.';}
 function visible(field,current){return !field.show_if||current[field.show_if.field]===field.show_if.equals;}
 function edit(){content.replaceChildren();const form=el('form');form.noValidate=true;const controls=new Map(),rows=new Map();
  function values(){const result={};for(const field of definition.fields){if(!visible(field,result))continue;const input=controls.get(field.key);result[field.key]=field.type==='checkbox'?input.checked:field.type==='number'&&input.value!==''?Number(input.value):input.value;}return result;}
  function visibility(){const current=values();for(const field of definition.fields)rows.get(field.key).hidden=!visible(field,current);}
  for(const field of definition.fields){const row=el('div'),label=el('label',field.label+(field.required?' *':''));label.htmlFor='field-'+field.key;
   let input;if(field.type==='select'){input=el('select');const empty=el('option','Choose an option');empty.value='';input.append(empty);for(const option of field.options){const o=el('option',option);o.value=option;input.append(o);}}
   else if(field.type==='textarea'){input=el('textarea');input.rows=4;input.maxLength=4000;}else{input=el('input');input.type=field.type;input.maxLength=1000;}
   input.id='field-'+field.key;input.name=field.key;input.required=field.required;if(field.min!==undefined)input.min=String(field.min);if(field.max!==undefined)input.max=String(field.max);
   if(field.type==='checkbox')input.checked=answers[field.key]===true;else input.value=String(answers[field.key]??'');
   const help=el('p',field.help||'');help.className='help';const error=el('p');error.id='error-'+field.key;error.className='error';error.setAttribute('role','alert');input.setAttribute('aria-describedby',error.id);row.append(label,input,help,error);form.append(row);controls.set(field.key,input);rows.set(field.key,row);input.oninput=()=>{error.textContent='';visibility();};
  }
  const review=el('button','Review answers');review.type='submit';form.append(review);form.onsubmit=e=>{e.preventDefault();run(async()=>{answers=values();const data=await api('/v1/form-session/review',{revision,answers});answers=data.answers;revision=data.revision;showReview();});};content.append(form);visibility();
 }
 function showReview(){content.replaceChildren(el('h2','Review your answers'));const list=el('dl');for(const field of definition.fields){if(answers[field.key]===undefined)continue;list.append(el('dt',field.label),el('dd',String(answers[field.key])));}content.append(list,button('Back to edit',edit,true),button('Confirm and submit',async()=>{const receipt=await api('/v1/form-session/submit',{revision,confirm:true});done(receipt);}));}
 function done(receipt){content.replaceChildren(el('h2',receipt.test?'Test received':'Submission received'),el('p',receipt.message),el('p','Reference: '+receipt.reference),el('p','Receiving this form does not confirm a booking or completion of an external action.'));try{sessionStorage.removeItem(storageKey);}catch{}token='';}
 async function init(){
  const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('session')||'';if(token)history.replaceState(null,'',location.pathname);
  if(!token)try{token=sessionStorage.getItem(storageKey)||'';}catch{}
  if(token){const session=await api('/v1/form-session');if(session.form_id&&session.form_id!==formId)throw new Error('This session belongs to another form. Start again.');heading(session);try{sessionStorage.setItem(storageKey,token);}catch{}if(session.status==='submitted')done({reference:session.id,message:definition.confirmation,test:session.test});else if(session.status==='reviewed')showReview();else edit();return;}
  const data=await api('/v1/public-forms/'+encodeURIComponent(formId));heading(data);content.append(button('Start form',async()=>{const session=await api('/v1/public-forms/'+encodeURIComponent(formId)+'/start',{});token=session.token;try{sessionStorage.setItem(storageKey,token);}catch{}heading(session);edit();}));
 }
 run(async()=>{try{await init();}catch(error){try{sessionStorage.removeItem(storageKey);}catch{}token='';content.replaceChildren(button('Start again',()=>{location.reload();}));throw error;}});
})();
