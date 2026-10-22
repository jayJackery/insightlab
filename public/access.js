const esc=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function setupAccess({api,onAuthenticated,onSignedOut}) {
 const root=document.querySelector('#auth-root');let identity=null,metadata={},loginBusy=false;
 const setFeedback=(message)=>{const node=root.querySelector('[role=alert]');if(node)node.textContent=message;};
 const controlsDisabled=value=>root.querySelectorAll('input,button').forEach(node=>node.disabled=value);
 const showLogin=async(message='')=>{
   identity=null;document.body.dataset.auth='locked';onSignedOut();
   root.innerHTML='<main class="access-card"><a class="access-brand">✳ insightlab</a><span class="access-kicker">部门研发工作区</span><h1>登录技术洞察工作台</h1><p>使用姓名和密码登录，保存你的调研与报告。</p><form id="name-login"><label for="login-name">姓名</label><input id="login-name" class="input" autocomplete="username" required minlength="2" maxlength="40" placeholder="请输入姓名；同名同事请加可区分的标识"><label for="login-password">密码</label><input id="login-password" class="input" type="password" autocomplete="current-password" required maxlength="128" placeholder="首次使用部门统一初始密码"><label class="local-admin-choice" hidden><input id="login-local-admin" type="checkbox"><span>以本机管理员身份进入<small>管理服务配置，并查看本机原有报告</small></span></label><p role="alert" class="access-error"></p><button class="primary" type="submit">登录工作台 ↗</button></form><div class="access-note"><strong>首次使用</strong><p class="registration-hint">正在读取账号开通状态…</p><small>姓名自助账号不代表已验证钉钉群成员身份。</small></div></main>';
   try{metadata=await api('/api/auth/status');root.querySelector('.local-admin-choice').hidden=!metadata.localAdminAvailable;root.querySelector('.registration-hint').textContent=!metadata.configured?'管理员尚未设置初始密码。':metadata.registrationEnabled?'使用姓名和部门初始密码自动建立账号，首次登录后设置个人密码。':'自助开通已关闭，请联系本机管理员开通账号。';if(!metadata.configured)root.querySelector('[type=submit]').disabled=true;}catch(error){setFeedback(error.message);}
   if(message)setFeedback(message);
   root.querySelector('form').addEventListener('submit',async event=>{
     event.preventDefault();if(loginBusy)return;loginBusy=true;
     const payload={name:root.querySelector('#login-name').value.trim(),password:root.querySelector('#login-password').value,localAdmin:root.querySelector('#login-local-admin').checked};
     controlsDisabled(true);setFeedback('正在登录…');
     try{const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify(payload)});root.querySelector('#login-password').value='';await accept(result.user);}
     catch(error){setFeedback(error.message);controlsDisabled(false);}
     finally{loginBusy=false;}
   });
 };
 const showFirstPassword=user=>{
   document.body.dataset.auth='locked';
   root.innerHTML='<main class="access-card"><span class="access-kicker">首次登录 · '+esc(user.name)+'</span><h1>设置个人密码</h1><p>部门初始密码用于开通账号。设置个人密码后进入你的工作区。</p><form><label for="first-current">部门初始密码</label><input id="first-current" class="input" type="password" autocomplete="current-password" required><label for="first-new">新的个人密码</label><input id="first-new" class="input" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="至少8个字符，可包含中文"><label for="first-confirm">确认个人密码</label><input id="first-confirm" class="input" type="password" autocomplete="new-password" required><p class="access-error" role="alert"></p><button class="primary" type="submit">保存并进入工作台 ↗</button><button class="access-text-button" type="button" id="first-cancel">退出登录</button></form></main>';
   root.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const currentPassword=root.querySelector('#first-current').value,newPassword=root.querySelector('#first-new').value;if(newPassword!==root.querySelector('#first-confirm').value)return setFeedback('两次新密码不一致。');controlsDisabled(true);try{await api('/api/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});await refresh();}catch(error){setFeedback(error.message);controlsDisabled(false);}});
   root.querySelector('#first-cancel').addEventListener('click',logout);
 };
 const accept=async user=>{
   identity=user;
   if(user.mustChangePassword)return showFirstPassword(user);
   document.body.dataset.auth='ready';root.replaceChildren();
   document.querySelector('#account-name').textContent=user.browserMode?'网页版 · 无需安装':user.localMode?'本机便携版':user.name+(user.localAdmin?' · 本机管理员':'');
   document.querySelector('#open-settings').hidden=!user.localAdmin;document.querySelector('#open-team-admin').hidden=user.localMode||!user.localAdmin;
   document.querySelector('#change-own-password').hidden=Boolean(user.localMode);document.querySelector('#logout-account').hidden=Boolean(user.localMode);
   const label=document.querySelector('.sidebar .user strong'),note=document.querySelector('.sidebar .user small');if(label)label.textContent=user.name;if(note)note.textContent=user.browserMode?'无需登录 · 数据保存在当前浏览器':user.localMode?'无需登录 · 数据仅保存在本机':user.localAdmin?'本机管理员 · 可见历史':'个人工作区 · 默认私有';
   await onAuthenticated(user);
 };
 const refresh=async()=>{const result=await api('/api/auth/me');await accept(result.user);};
 const logout=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});await showLogin();}catch(error){window.alert(error.message);}};
 document.querySelector('#logout-account').addEventListener('click',logout);
 document.querySelector('#change-own-password').addEventListener('click',()=>openPasswordDialog(api));
 document.querySelector('#open-team-admin').addEventListener('click',()=>openAdminDialog(api));
 document.addEventListener('session-expired',()=>{if(identity){identity=null;showLogin('登录已过期，请重新登录。');}});
 return {start:async()=>{
   try{metadata=await api('/api/auth/status');await refresh();}
   catch(error){
     if(metadata.identityMode==='name_password')return showLogin();
     document.body.dataset.auth='locked';root.innerHTML='<main class="access-card"><h1>工作台暂时无法打开</h1><p>'+esc(error.message || '请重新启动便携工作台。')+'</p><button class="primary" type="button">重新连接</button></main>';root.querySelector('button').addEventListener('click',()=>location.reload());
   }
 },getUser:()=>identity};
}

function createDialog(title,subtitle,body){
 const dialog=document.createElement('dialog');dialog.className='team-dialog';dialog.innerHTML='<form><header><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button type="button" data-close aria-label="关闭">×</button></header><div class="team-dialog-body">'+body+'<p class="access-error" role="alert"></p></div><footer><button type="button" data-close>取消</button><button type="submit" class="primary">保存</button></footer></form>';document.body.append(dialog);dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return dialog;
}
function openPasswordDialog(api){
 const dialog=createDialog('修改个人密码','修改后，其他设备上的登录将失效。','<label>当前密码<input class="input" type="password" name="currentPassword" autocomplete="current-password" required></label><label>新密码<input class="input" type="password" name="newPassword" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>确认新密码<input class="input" type="password" name="confirmPassword" autocomplete="new-password" required></label>');
 dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));if(data.newPassword!==data.confirmPassword){dialog.querySelector('[role=alert]').textContent='两次新密码不一致。';return;}const button=dialog.querySelector('[type=submit]');button.disabled=true;try{await api('/api/auth/password',{method:'POST',body:JSON.stringify({currentPassword:data.currentPassword,newPassword:data.newPassword})});dialog.close();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}});
}
async function openAdminDialog(api){
 try{
 const data=await api('/api/team/admin');
 const labels={stageStartsPerUser:'个人每日阶段启动上限',modelCallsPerUser:'个人每日模型调用上限',searchCallsPerUser:'个人每日搜索调用上限',modelCallsGlobal:'工作区每日模型调用上限',searchCallsGlobal:'工作区每日搜索调用上限',queuedPerUser:'个人执行及排队任务上限'};
 const dialog=createDialog('账号与调用限额','仅本机管理员可管理；限额按北京时间每日重新计数。','<label class="team-registration"><input type="checkbox" name="registration" '+(data.registrationEnabled?'checked':'')+'>允许通过姓名和统一初始密码自助建号</label><p class="team-caption">当前未接入钉钉群成员认证。关闭后，新姓名无法自助开通；已有账号仍可登录。</p><div class="team-limits">'+Object.entries(labels).map(([key,label])=>'<label>'+label+'<input class="input" type="number" min="1" max="'+(key==='queuedPerUser'?10:10000)+'" name="'+key+'" value="'+Number(data.limits[key])+'" required></label>').join('')+'</div><p class="team-caption">计划生成、开始研究、补查新建和重试均计一次阶段启动。模型/搜索失败尝试也计数；调用次数不是金额预算。当前串行执行，排队 '+data.queued+' 项。</p><h3>已开通账号 · '+data.users.length+'</h3><div class="team-user-list">'+data.users.map(user=>'<div><span><strong>'+esc(user.name)+'</strong><small>'+(user.mustChangePassword?'待设置个人密码':'已设置个人密码')+' · '+(user.active?'启用':'停用')+'</small></span><button type="button" data-reset="'+esc(user.id)+'">重置初始密码</button><button type="button" data-active="'+esc(user.id)+'" data-enabled="'+(user.active?'0':'1')+'">'+(user.active?'停用':'启用')+'</button></div>').join('')+'</div>');
 dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget),limits=Object.fromEntries(Object.keys(labels).map(key=>[key,Number(form.get(key))]));const button=dialog.querySelector('[type=submit]');button.disabled=true;try{await api('/api/team/admin',{method:'POST',body:JSON.stringify({registrationEnabled:form.has('registration'),limits})});dialog.close();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}});
 dialog.addEventListener('click',async event=>{const reset=event.target.closest('[data-reset]'),active=event.target.closest('[data-active]');if(!reset&&!active)return;if(!window.confirm(reset?'重置为部门初始密码，并退出该账号的所有登录？':'变更该账号状态，并退出该账号的所有登录？'))return;const button=reset || active;button.disabled=true;try{await api('/api/team/user',{method:'POST',body:JSON.stringify(reset?{action:'reset',id:reset.dataset.reset}:{action:'active',id:active.dataset.active,active:active.dataset.enabled==='1'})});dialog.close();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}});
 }catch(error){window.alert(error.message);}
}
export async function openTaskSharing(api,id){
 try{const current=await api('/api/tasks/'+id+'/share');const dialog=createDialog('分享只读报告','填写已开通账号的同事姓名，每行一个；清空名单即可撤销全部分享。','<label>可查看的同事<textarea name="names" class="input" rows="5" placeholder="填写同事登录时使用的完整姓名">'+esc(current.names.join('\n'))+'</textarea></label><p class="team-caption">仅分享本条任务。接收者可以阅读、核对来源和导出，不能修改或重试你的研究。</p>');dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const names=[...new Set(new FormData(event.currentTarget).get('names').split(/[\n；;，,]+/u).map(name=>name.trim()).filter(Boolean))],button=dialog.querySelector('[type=submit]');button.disabled=true;try{await api('/api/tasks/'+id+'/share',{method:'POST',body:JSON.stringify({names})});dialog.close();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}});}catch(error){window.alert(error.message);}
}
