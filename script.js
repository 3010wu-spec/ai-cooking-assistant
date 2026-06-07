/**
 * AI 料理小幫手 Pro 核心控制引擎
 * 更新功能：優化即時料理推薦，改為按鍵新增、即時列表格的複數食材與重量動態輸入系統
 */

document.addEventListener('DOMContentLoaded', () => {
    // 界面通用元件
    const apiKeyInput = document.getElementById('api-key');
    const loadingView = document.getElementById('loading-view');
    const loadingTitle = document.getElementById('loading-title');
    const loadingDesc = document.getElementById('loading-desc');
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    const closeErrorBtn = document.getElementById('close-error');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const historyList = document.getElementById('history-list');
    const btnClearHistory = document.getElementById('btn-clear-history');

    // 頁籤切換控制
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // 分頁一：即時料理推薦相關新元件
    const recipeForm = document.getElementById('recipe-form');
    const btnSubmit = document.getElementById('btn-submit');
    const instantNameInput = document.getElementById('instant-name-input');
    const instantWeightInput = document.getElementById('instant-weight-input');
    const btnAddInstantIngredient = document.getElementById('btn-add-instant-ingredient');
    const instantIngredientsTbody = document.getElementById('instant-ingredients-tbody');

    const proposalView = document.getElementById('proposal-view');
    const proposalList = document.getElementById('proposal-list');
    const btnTriggerRecipe = document.getElementById('btn-trigger-recipe');
    const resultView = document.getElementById('result-view');
    const recipeContent = document.getElementById('recipe-content');
    const conditionSummary = document.getElementById('condition-summary');
    const aiMeta = document.getElementById('ai-meta');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');

    // 分頁二：冰箱管理規劃器元件
    const fridgeNameInput = document.getElementById('fridge-name-input');
    const fridgeWeightInput = document.getElementById('fridge-weight-input');
    const btnAddFridge = document.getElementById('btn-add-fridge');
    const fridgeTagsContainer = document.getElementById('fridge-tags-container');
    const btnGenerateWeek = document.getElementById('btn-generate-week');

    // 狀態暫存庫
    let instantIngredients = []; // 即時料理的食材陣列 [{name: '牛肉', weight: 250}]
    let fridgeIngredients = [
        { name: '雞蛋', weight: 300 },
        { name: '高麗菜', weight: 500 },
        { name: '豬肉', weight: 400 },
        { name: '洋蔥', weight: 250 }
    ];
    let recipeHistory = JSON.parse(localStorage.getItem('cooking_pro_history')) || [];
    let currentProposals = []; 
    let lastSavedConfig = {};

    // 初始化核心設定
    initApp();

    function initApp() {
        const savedKey = localStorage.getItem('gemini_cooking_key');
        if (savedKey) apiKeyInput.value = savedKey;

        const savedTheme = localStorage.getItem('cooking_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);

        renderInstantTable();
        renderFridgeTags();
        renderHistory();
    }

    // 頁籤切換
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('none', 'active'));
            button.classList.add('active');
            const activeTabId = button.getAttribute('data-tab');
            document.getElementById(activeTabId).classList.add('active');
        });
    });

    /**
     * 🔥 核心改版功能：即時料理食材「一鍵填寫、右側列表格、無限續加」
     */
    btnAddInstantIngredient.addEventListener('click', () => {
        const name = instantNameInput.value.trim();
        const weight = parseInt(instantWeightInput.value.trim());

        if (!name) {
            alert('請輸入食材名稱！');
            return;
        }
        if (!weight || weight <= 0) {
            alert('請輸入有效的克數重量！');
            return;
        }

        // 如果輸入重複的菜，就直接累加克數
        const existing = instantIngredients.find(item => item.name === name);
        if (existing) {
            existing.weight += weight;
        } else {
            instantIngredients.push({ name, weight });
        }

        // 清空輸入欄位，讓使用者可以點擊後「立刻輸入下一道菜」
        instantNameInput.value = '';
        instantWeightInput.value = '';
        instantNameInput.focus();

        renderInstantTable();
    });

    // 渲染即時料理食材表格
    function renderInstantTable() {
        instantIngredientsTbody.innerHTML = '';
        
        if (instantIngredients.length === 0) {
            instantIngredientsTbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-muted" style="text-align: center; padding: 20px;">
                        ⚠️ 尚未加入任何食材。請在上方輸入後點擊「新增」。
                    </td>
                </tr>
            `;
            return;
        }

        instantIngredients.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>🥩 ${item.name}</strong></td>
                <td>${item.weight} g</td>
                <td style="text-align: center;">
                    <button type="button" class="btn-delete-row" data-index="${idx}">&times;</button>
                </td>
            `;
            instantIngredientsTbody.appendChild(tr);
        });

        // 綁定刪除事件
        instantIngredientsTbody.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                instantIngredients.splice(idx, 1);
                renderInstantTable();
            });
        });
    }

    // 轉換成 AI 看得懂的格式化食材字串
    function getFormattedInstantString() {
        return instantIngredients.map(i => `${i.name}(${i.weight}g)`).join('、');
    }

    // 冰箱食材增刪管理
    function renderFridgeTags() {
        fridgeTagsContainer.innerHTML = '';
        fridgeIngredients.forEach((item, index) => {
            const tag = document.createElement('div');
            tag.className = 'ingredient-tag';
            tag.innerHTML = `${item.name} (${item.weight}g) <span data-index="${index}">&times;</span>`;
            fridgeTagsContainer.appendChild(tag);
        });
    }

    btnAddFridge.addEventListener('click', () => {
        const name = fridgeNameInput.value.trim();
        const weight = parseInt(fridgeWeightInput.value.trim());
        if (name && weight) {
            const existing = fridgeIngredients.find(i => i.name === name);
            if (existing) {
                existing.weight += weight;
            } else {
                fridgeIngredients.push({ name, weight });
            }
            fridgeNameInput.value = '';
            fridgeWeightInput.value = '';
            renderFridgeTags();
        }
    });

    fridgeTagsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            const index = e.target.getAttribute('data-index');
            fridgeIngredients.splice(index, 1);
            renderFridgeTags();
        }
    });

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('cooking_theme', newTheme);
    });

    closeErrorBtn.addEventListener('click', () => errorAlert.classList.add('hidden'));

    btnClearHistory.addEventListener('click', () => {
        if (confirm('確定要清空所有歷史食譜與規劃紀錄嗎？')) {
            recipeHistory = [];
            localStorage.setItem('cooking_pro_history', JSON.stringify(recipeHistory));
            renderHistory();
        }
    });

    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(recipeContent.innerText)
            .then(() => alert('📋 內容已成功複製到剪貼簿！'))
            .catch(() => alert('複製失敗'));
    });

    btnDownload.addEventListener('click', () => {
        const rawText = recipeContent.innerText;
        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI_料理企劃案_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    /**
     * 階段一：生成多個方案
     */
    recipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorAlert.classList.add('hidden');
        proposalView.classList.add('hidden');
        resultView.classList.add('hidden');

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) return showError('請先輸入有效的 Gemini API Key。');
        localStorage.setItem('gemini_cooking_key', apiKey);

        if (instantIngredients.length === 0) {
            return showError('請至少在即時料理表格內新增一項食材與重量！');
        }

        // 讀取複選資料
        const selectedAllergies = Array.from(document.querySelectorAll('input[name="allergy"]:checked')).map(el => el.value).join('、') || '無特殊過敏原';
        const selectedEquipments = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(el => el.value).join('、') || '基本廚具';
        const selectedNutritions = Array.from(document.querySelectorAll('input[name="nutrition"]:checked')).map(el => el.value).join('、') || '平衡膳食';
        
        const comprehensiveIngredients = getFormattedInstantString();

        lastSavedConfig = {
            cuisineType: document.getElementById('cuisine-type').value,
            textMealPeriod: document.getElementById('meal-period').value,
            budget: document.getElementById('budget').value,
            availableTime: document.getElementById('available-time').value,
            ingredients: comprehensiveIngredients,
            servings: document.getElementById('servings').value,
            tasteProfile: document.getElementById('taste-profile').value,
            targetAudience: document.getElementById('target-audience').value,
            aiMode: document.getElementById('ai-mode').value,
            allergyExclude: selectedAllergies,
            equipments: selectedEquipments,
            nutritions: selectedNutritions
        };

        setLoading(true, 'AI 主廚正在篩選多組可行方案...', '正在考慮您的精確食材列表、預算與複選過敏原...');

        const proposalPrompt = `你是一位專業主廚與嚴格的營養師。請根據以下要求，設計出 3 個完全符合條件的「主菜+副菜+湯品」套餐方案，供使用者挑選。
條件規格：
- 料理類型: ${lastSavedConfig.cuisineType} | 時段: ${lastSavedConfig.textMealPeriod}
- 預算: ${lastSavedConfig.budget}元 TWD | 時間: ${lastSavedConfig.availableTime}
- 表格帶重量食材: ${lastSavedConfig.ingredients} (請務必完全參考括號內克數安排合理的食材消耗比)
- 份數: ${lastSavedConfig.servings} | 口味: ${lastSavedConfig.tasteProfile}
- 對象: ${lastSavedConfig.targetAudience} | 模式: ${lastSavedConfig.aiMode}
- 嚴格排除過敏原: ${lastSavedConfig.allergyExclude}
- 擁有廚具: ${lastSavedConfig.equipments}
- 目標需求: ${lastSavedConfig.nutritions}

請嚴格依照 JSON 格式輸出（不要包含任何 markdown 語法外框，直接輸出純 JSON 字串），格式如下：
[
  {
    "id": 1,
    "title": "方案名稱 (主菜+副菜+湯品名稱)",
    "cost": "預估總成本元",
    "time": "總時間",
    "level": "難易度(新手/中等/專業)",
    "calories": "總熱量 kcal",
    "feature": "本方案如何利用現有克數食材達到口味與過敏原安全亮點"
  }
]`;

        try {
            let rawJson = await callGeminiWithRetry(apiKey, proposalPrompt);
            const startIdx = rawJson.indexOf('[');
            const endIdx = rawJson.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
                rawJson = rawJson.substring(startIdx, endIdx + 1);
            }
            currentProposals = JSON.parse(rawJson.trim());
            renderProposals(currentProposals);
        } catch (err) {
            showError('方案生成中斷：' + err.message);
        } finally {
            setLoading(false);
        }
    });

    function renderProposals(proposals) {
        proposalList.innerHTML = '';
        proposals.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = `proposal-item ${idx === 0 ? 'selected' : ''}`;
            item.innerHTML = `
                <input type="radio" name="proposal-choice" class="proposal-radio" value="${p.id}" ${idx === 0 ? 'checked' : ''}>
                <div class="proposal-details">
                    <strong>🍱 ${p.title}</strong>
                    <p style="font-size:0.9rem; margin: 4px 0; color:var(--text-secondary);">${p.feature}</p>
                    <div class="proposal-meta-grid">
                        <span class="badge-meta">💰 預算: ${p.cost}</span>
                        <span class="badge-meta">⏱️ 時間: ${p.time}</span>
                        <span class="badge-meta">⚡ 難度: ${p.level}</span>
                        <span class="badge-meta">🔥 熱量: ${p.calories}</span>
                    </div>
                </div>
            `;
            item.addEventListener('click', () => {
                document.querySelectorAll('.proposal-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                item.querySelector('.proposal-radio').checked = true;
            });
            proposalList.appendChild(item);
        });
        proposalView.classList.remove('hidden');
        proposalView.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * 階段二：生成詳細完整食譜流程
     */
    btnTriggerRecipe.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const selectedRadio = document.querySelector('input[name="proposal-choice"]:checked');
        if (!selectedRadio) return alert('請先勾選一個料理方案！');

        const chosenId = parseInt(selectedRadio.value);
        const chosenProposal = currentProposals.find(p => p.id === chosenId);

        proposalView.classList.add('hidden');
        setLoading(true, `正在為您深度展開：${chosenProposal.title}`, '結合食品科學原理、廚具替代方案與高精確度營養指標計算中...');
        const startTime = performance.now();

        const recipeDetailedPrompt = `你是一位擁有頂級證照的主廚與資深臨床營養師。
請針對使用者選定的套餐方案：【${chosenProposal.title}】，根據以下背景規格，輸出極為詳盡的完整食譜企劃：
- 導航模式: ${lastSavedConfig.aiMode}
- 料理對象與口味: 專為 ${lastSavedConfig.targetAudience} 客製，口味調配設定為 ${lastSavedConfig.tasteProfile}
- 限制條件: 預算 ${lastSavedConfig.budget}元內、時間 ${lastSavedConfig.availableTime}內
- 嚴格排除過敏原: ${lastSavedConfig.allergyExclude}
- 食材克數庫存參考: ${lastSavedConfig.ingredients}
- 設備配置: ${lastSavedConfig.equipments}

請使用整齊的 Markdown 語法輸出以下限定結構：
## 🏆 套餐核心企劃：${chosenProposal.title}
### 💡 套餐均衡度與料理對象分析
### 🛒 食材清單與價格精算 (${lastSavedConfig.servings}份量)
### 🍳 三道式全套烹飪程序 (${lastSavedConfig.aiMode} 深度)
#### 🥩 主菜料理步驟
#### 🥗 副菜料理步驟
#### 🥣 湯品料理步驟
### 📊 全套套餐精密營養與健康指標標示
- 總熱量: [填入] kcal | 蛋白質: [填入] g | 脂肪: [填入] g | 碳水: [填入] g | 鈉含量: [填入] mg
### 🥗 健康優點 (針對需求 ${lastSavedConfig.nutritions} 分析)
### ❌ 潛在缺點與飲食注意
### 🔬 專業烹飪技巧與食品科學原理
### 🔄 彈性食材替代與升級方案 (提供至少 3 種替換建議)`;

        try {
            const rawMarkdown = await callGeminiWithRetry(apiKey, recipeDetailedPrompt);
            const endTime = performance.now();
            const timeCost = ((endTime - startTime) / 1000).toFixed(2);

            document.getElementById('result-main-title').innerText = `🍽️ 全套套餐：${chosenProposal.title}`;
            conditionSummary.innerHTML = `
                <strong>📊 條件：</strong> 
                模式：<span class="tag">${lastSavedConfig.aiMode}</span> | 
                過敏原排除：<span class="tag">${lastSavedConfig.allergyExclude}</span> | 
                精確食材：<span class="tag">${lastSavedConfig.ingredients}</span>
            `;
            aiMeta.innerHTML = `⏱️ 頂級 AI 分析耗時：${timeCost} 秒 | 模型規格：Gemini 2.5 Flash`;
            recipeContent.innerHTML = customMarkdownParser(rawMarkdown);

            resultView.classList.remove('hidden');
            resultView.scrollIntoView({ behavior: 'smooth' });

            saveToHistoryList(chosenProposal.title, rawMarkdown, lastSavedConfig, timeCost);
        } catch (err) {
            showError('詳細食譜生成失敗：' + err.message);
        } finally {
            setLoading(false);
        }
    });

    /**
     * 獨立功能區：🧊 冰箱料理規劃器 - 一週菜單生成
     */
    btnGenerateWeek.addEventListener('click', async () => {
        errorAlert.classList.add('hidden');
        resultView.classList.add('hidden');
        proposalView.classList.add('hidden');

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) return showError('請先輸入有效的 Gemini API Key。');
        localStorage.setItem('gemini_cooking_key', apiKey);

        if (fridgeIngredients.length === 0) {
            return showError('您的冰箱目前沒有食材，請先在上方輸入名稱與克數新增！');
        }

        const fridgeMode = document.getElementById('fridge-mode').value;
        const formattedFridgeStr = fridgeIngredients.map(i => `${i.name}(${i.weight}g)`).join('、');

        setLoading(true, 'AI 食材管理專家正在規劃一週精準菜單...', '正最大化優化食材消耗比例，全面防範食材過期與浪費...');
        const startTime = performance.now();

        const fridgePrompt = `你是一位專業營養師與高階食材管理專家。
現在已知使用者冰箱裡有以下「現有食材與重量庫存」：【${formattedFridgeStr}】。
請以此為基礎，為使用者設計一份最高食材利用率、無預算限制、完美發揮所有食材的「一週菜單（7天，週一至週日，每日包含早餐、午餐、晚餐套餐）」。

指導原則：
1. 必須「優先且高度循環使用」現有食材與對應克數，最大化提升使用率，消滅浪費。
2. 每天餐點維持營養結構平衡，避免連續兩頓吃重複料理。

請遵循以下 Markdown 格式輸出，並使用專用收合結構語法 [[[星期X]]] 包裝每天的菜單：

## 🧊 冰箱規劃：一週智慧黃金菜單

[[[星期一]]]
- **早餐：** [填入餐點名稱] (消耗冰箱食材...)
- **午餐：** [填入餐點名稱]
- **晚餐：** [填入餐點名稱與主副湯結構]
- **本日精算熱量：** [填入] kcal
[[[星期二]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
[[[星期三]]]
- **早餐：** ...
[[[星期四]]]
- **早餐：** ...
[[[星期五]]]
- **早餐：** ...
[[[星期六]]]
- **早餐：** ...
[[[星期日]]]
- **早餐：** ...

---

## 🛒 自動化追加補給購物清單 (一週份)
請列出為了完成這7天，現有冰箱庫存不夠、必須額外去採買的食材清單：
- [ ] [食材名稱] | 建議採買重量/規格

---

## 📊 食材利用率與消耗全盤分析
- **現有冰箱食材總體消耗率：** [填入百分比]%
- **剩餘未用完食材保存指引：** [列出項目]
- **後續延長保存與殘料再利用建議：** [填入]`;

        try {
            const rawMarkdown = await callGeminiWithRetry(apiKey, fridgePrompt);
            const endTime = performance.now();
            const timeCost = ((endTime - startTime) / 1000).toFixed(2);

            document.getElementById('result-main-title').innerText = `🧊 冰箱規劃：一週全能菜單方案`;
            conditionSummary.innerHTML = `<strong>📊 冰箱管理配置：</strong> 導向模式：<span class="tag">${fridgeMode}</span> | 預算：<span class="tag">不設限 (最大化消耗現有食材導向)</span>`;
            aiMeta.innerHTML = `⏱️ 冰箱大數據整合耗時：${timeCost} 秒 | 模型規格：Gemini 2.5 Flash`;
            
            recipeContent.innerHTML = customMarkdownParser(rawMarkdown);
            resultView.classList.remove('hidden');
            resultView.scrollIntoView({ behavior: 'smooth' });

            saveToHistoryList('一週冰箱計畫: ' + fridgeMode, rawMarkdown, { mode: fridgeMode }, timeCost);
        } catch (err) {
            showError('一週菜單生成失敗：' + err.message);
        } finally {
            setLoading(false);
        }
    });

    /**
     * 底層 API 串接：內建「503 錯誤抗震自動重試機制」
     */
    async function callGeminiWithRetry(apiKey, prompt, retries = 3, delay = 3000) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        for (let i = 0; i < retries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 503) {
                    if (i < retries - 1) {
                        console.warn(`遭遇 503 錯誤（伺服器忙碌中）。正在進行第 ${i + 1} 次自動重試...`);
                        await new Promise(res => setTimeout(res, delay));
                        continue;
                    } else {
                        throw new Error('Google Gemini 伺服器目前嚴重塞車中（錯誤碼 503）。請稍等 10-20 秒鐘後再點擊一次按鈕即可恢復。');
                    }
                }

                if (!response.ok) {
                    if (response.status === 400 || response.status === 403) {
                        throw new Error('API Key 驗證失敗，請檢查您最上方輸入的金鑰是否正確。');
                    }
                    throw new Error(`連線異常，狀態碼：${response.status}`);
                }

                const data = await response.json();
                return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            } catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    // Markdown 轉 HTML 渲染引擎
    function customMarkdownParser(mdText) {
        let lines = mdText.split('\n');
        let htmlOutput = [];
        let inList = false;
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();

            if (trimmed.startsWith('[[[') && trimmed.endsWith(']]]')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                if (inTable) { htmlOutput.push('</tbody></table>'); inTable = false; }
                const dayName = trimmed.replace('[[[', '').replace(']]]', '');
                if (htmlOutput.join('').includes('class="collapsible-content"')) {
                    htmlOutput.push('</div></div>');
                }
                htmlOutput.push(`
                    <div class="collapsible-section">
                        <div class="collapsible-trigger" onclick="this.nextElementSibling.classList.toggle('hidden')">
                            📅 ${dayName} 菜單規劃 <span>▼ 點擊展開/收合</span>
                        </div>
                        <div class="collapsible-content padding-10" style="padding: 15px;">
                `);
                continue;
            }

            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                if (trimmed.includes('---') || trimmed.includes('-:-')) continue;
                const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
                if (!inTable) {
                    inTable = true;
                    htmlOutput.push('<table><thead><tr>');
                    cells.forEach(cell => htmlOutput.push(`<th>${parseInline(cell)}</th>`));
                    htmlOutput.push('</tr></thead><tbody>');
                } else {
                    htmlOutput.push('<tr>');
                    cells.forEach(cell => htmlOutput.push(`<td>${parseInline(cell)}</td>`));
                    htmlOutput.push('</tr>');
                }
                continue;
            } else {
                if (inTable) { htmlOutput.push('</tbody></table>'); inTable = false; }
            }

            if (trimmed.startsWith('## ')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                htmlOutput.push(`<h2>${parseInline(trimmed.substring(3))}</h2>`);
                continue;
            }
            if (trimmed.startsWith('### ')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                htmlOutput.push(`<h3>${parseInline(trimmed.substring(4))}</h3>`);
                continue;
            }
            if (trimmed.startsWith('#### ')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                htmlOutput.push(`<h4 style="margin-top:10px; color:var(--primary);">${parseInline(trimmed.substring(5))}</h4>`);
                continue;
            }

            const listMatch = trimmed.match(/^(\d+\.|-|\*|\[\s\]|\[x\])\s+(.*)/);
            if (listMatch) {
                if (!inList) { htmlOutput.push('<ul>'); inList = true; }
                let content = listMatch[2];
                if (listMatch[1] === '[ ]') content = `<input type="checkbox" disabled> ` + content;
                if (listMatch[1] === '[x]') content = `<input type="checkbox" checked disabled> ` + content;
                htmlOutput.push(`<li>${parseInline(content)}</li>`);
                continue;
            } else {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
            }

            if (trimmed === '' || trimmed === '---') {
                if (trimmed === '---') htmlOutput.push('<hr class="divider">');
                continue;
            }
            htmlOutput.push(`<p>${parseInline(trimmed)}</p>`);
        }

        if (inTable) htmlOutput.push('</tbody></table>');
        if (inList) htmlOutput.push('</ul>');
        if (mdText.includes('[[[')) htmlOutput.push('</div></div>');

        return htmlOutput.join('');
    }

    function parseInline(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    function saveToHistoryList(name, text, params, timeCost) {
        const item = { id: Date.now(), dishName: name, timestamp: new Date().toLocaleString('zh-TW'), rawMarkdown: text, params: params, timeCost: timeCost };
        recipeHistory.unshift(item);
        if (recipeHistory.length > 15) recipeHistory.pop();
        localStorage.setItem('cooking_pro_history', JSON.stringify(recipeHistory));
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        if (recipeHistory.length === 0) {
            historyList.innerHTML = '<li class="text-muted text-center" style="padding:15px;">尚無任何歷史規劃紀錄</li>';
            return;
        }
        recipeHistory.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `<strong>${item.dishName}</strong><span class="text-muted" style="font-size:0.8rem;">${item.timestamp}</span>`;
            li.addEventListener('click', () => {
                document.getElementById('result-main-title').innerText = item.dishName;
                conditionSummary.innerHTML = `<strong>📊 載入歷史快照存檔紀錄</strong>`;
                aiMeta.innerHTML = `⏱️ 原分析耗時：${item.timeCost} 秒`;
                recipeContent.innerHTML = customMarkdownParser(item.rawMarkdown);
                resultView.classList.remove('hidden');
                resultView.scrollIntoView({ behavior: 'smooth' });
            });
            historyList.appendChild(li);
        });
    }

    function setLoading(isLoading, title = '', desc = '') {
        if (isLoading) {
            btnSubmit.disabled = true;
            btnGenerateWeek.disabled = true;
            loadingTitle.innerText = title;
            loadingDesc.innerText = desc;
            loadingView.classList.remove('hidden');
        } else {
            btnSubmit.disabled = false;
            btnGenerateWeek.disabled = false;
            loadingView.classList.add('hidden');
        }
    }

    function showError(msg) {
        errorMessage.innerText = msg;
        errorAlert.classList.remove('hidden');
        errorAlert.scrollIntoView({ behavior: 'smooth' });
    }
});
