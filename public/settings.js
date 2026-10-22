export function setupServiceSettings({ api, onConfig }) {
  const browser=document.documentElement.dataset.runtime==='browser';
  const $ = (selector) => document.querySelector(selector);
  const dialog = $('#settings-dialog'), form = $('#settings-form');
  const keys = [['DEEPSEEK_API_KEY', 'deepseek'], ['OPENAI_API_KEY', 'compatible'], ['TAVILY_API_KEY', 'tavily']];
  const feedback = (message, kind = '') => {
    $('#settings-feedback').textContent = message;
    $('#settings-feedback').className = 'settings-feedback ' + kind;
  };
  const clearInputs = () => {
    for (const [, id] of keys) { $('#' + id + '-key').value = ''; $('#' + id + '-key').disabled = false; $('#remove-' + id + '-key').checked = false; }
  };
  const keyStatuses = (config) => {
    for (const [key, id] of keys) {
      const info = config.keys[key];
      $('#' + id + '-key-status').textContent = info.configured ? (info.source==='session'?'已配置 · 仅本页有效':info.source === 'environment' ? '已配置 · 启动环境' : '已配置 · 本机保存') : '未配置';
      $('#' + id + '-key').placeholder = info.configured ? '已配置；留空保留，输入新密钥可替换' : '在此输入服务商提供的 API Key';
      $('#remove-' + id + '-key').disabled = !info.configured;
    }
  };
  const syncProviders = () => {
    const model = $('#model-provider').value, search = $('#search-provider').value;
    // Move the existing field; never clone a password input or discard unsaved text.
    const deepseekGroup=$('#deepseek-key-group');
    const destination=$(model==='deepseek'?'#model-key-slot':'#search-key-slot');
    if(deepseekGroup.parentElement!==destination)destination.append(deepseekGroup);
    $('#deepseek-key-group').hidden = model !== 'deepseek' && search !== 'deepseek';
    $('#compatible-key-group').hidden = model !== 'compatible';
    $('#tavily-key-group').hidden = search !== 'tavily';
    $('#shared-search-key').hidden=!(model==='deepseek'&&search==='deepseek');
    $('#deepseek-key-label').textContent=model==='deepseek'?'模型 API Key · DeepSeek':'搜索 API Key · DeepSeek';
    $('#deepseek-key-purpose').textContent = model === 'deepseek' && search === 'deepseek' ? '用于模型分析与 DeepSeek 搜索，只需填写一次。' : model === 'deepseek' ? '仅用于模型分析；搜索密钥在公开资料搜索区域填写。' : '仅用于搜索公开资料，与模型密钥分别配置。';
    $('#compatible-key-label').textContent = '模型 API Key · 兼容服务';
  };
  syncProviders();
  const open = async () => {
    clearInputs(); feedback('正在读取配置…');
    syncProviders();
    if (!dialog.open) dialog.showModal();
    try {
      const config = await api('/api/config');
      if (!config.keys) throw Error('当前后端版本未支持完整配置，请重启本机服务后刷新页面。');
      const empty = !Object.values(config.keys).some((key) => key.configured);
      $('#model-provider').value = empty ? 'deepseek' : config.modelProvider;
      $('#search-provider').value = empty ? 'deepseek' : config.searchProvider;
      $('#model-base').value = empty ? 'https://api.deepseek.com' : config.modelBaseUrl;
      $('#model-name').value = empty ? 'deepseek-flash' : config.model;
      keyStatuses(config); syncProviders(); feedback('');
    } catch (error) { feedback(error.message, 'error'); }
  };
  $('#open-settings').addEventListener('click', open);
  $('#close-settings').addEventListener('click', () => dialog.close());
  $('#go-model-key').addEventListener('click',()=>{$('#deepseek-key').scrollIntoView({block:'center',behavior:'smooth'});$('#deepseek-key').focus({preventScroll:true});});
  dialog.addEventListener('close', () => { clearInputs(); feedback(''); });
  $('#model-provider').addEventListener('change', () => {
    const deepseek = $('#model-provider').value === 'deepseek';
    $('#model-base').value = deepseek ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
    $('#model-name').value = deepseek ? 'deepseek-flash' : 'gpt-4o-mini';
    syncProviders(); feedback('模型服务已切换，请确认接口地址与模型名称后保存。');
  });
  $('#search-provider').addEventListener('change', () => { syncProviders(); feedback('搜索服务已切换，保存后生效。'); });
  for (const [, id] of keys) {
    $('#remove-' + id + '-key').addEventListener('change', () => {
      const remove = $('#remove-' + id + '-key').checked;
      $('#' + id + '-key').disabled = remove;
      if (remove) $('#' + id + '-key').value = '';
    });
  }
  const save = async (check) => {
    if (!form.reportValidity()) return;
    const saveButton = $('#save-settings'), checkButton = $('#check-settings');
    saveButton.disabled = true; checkButton.disabled = true;
    // Freeze edits while the saved configuration is being checked.
    const controls = Array.from(form.querySelectorAll('input,select'));
    const disabled = controls.map((input) => input.disabled);
    const payload = { MODEL_PROVIDER: $('#model-provider').value, OPENAI_BASE_URL: $('#model-base').value.trim(), OPENAI_MODEL: $('#model-name').value.trim(), SEARCH_PROVIDER: $('#search-provider').value, clearKeys: [] };
    for (const [key, id] of keys) {
      if ($('#remove-' + id + '-key').checked) payload.clearKeys.push(key);
      else if ($('#' + id + '-key').value.trim()) payload[key] = $('#' + id + '-key').value.trim();
    }
    controls.forEach((input) => { input.disabled = true; });
    feedback('正在保存配置…');
    let saved;
    try {
      saved = await api('/api/config', { method: 'POST', body: JSON.stringify(payload) });
      clearInputs(); onConfig(saved);
      if (check) {
        feedback('配置已保存，正在分别连接模型与搜索服务…');
        const result = await api('/api/config/check', { method: 'POST', body: '{}' });
        const rows = [['模型', result.model], ['搜索', result.search]];
        feedback(rows.map(([name, value]) => (value.ok ? '✓ ' : '✕ ') + name + '：' + value.message).join('\n') + '\n' + (rows.every(([, value]) => value.ok) ? '可以关闭窗口并开始调研。' : '配置已保存，请根据提示调整后再次检测。'), rows.every(([, value]) => value.ok) ? 'success' : 'error');
      } else feedback(browser?'已应用到当前页面，密钥未持久保存。刷新后请重新填写；“应用并检测连接”可能产生少量API费用。':'配置已保存并立即生效。可点击“保存并检测连接”检查账号是否可用。', 'success');
    } catch (error) { feedback((saved ? '配置已保存。' : '') + error.message, 'error'); }
    finally {
      controls.forEach((input, i) => { input.disabled = disabled[i]; });
      if (saved) { keyStatuses(saved); for (const [, id] of keys) $('#' + id + '-key').disabled = false; }
      saveButton.disabled = false; checkButton.disabled = false;
    }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); save(false); });
  $('#check-settings').addEventListener('click', () => save(true));
}
