/**
 * AI 料理小幫手 Pro 核心控制引擎
 * 完全無後端，全功能擴充版 (串接 2026 最新穩定 Gemini 2.5 Flash 模型)
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

    // 分頁一：即時料理推薦相關元件
    const recipeForm = document.getElementById('recipe-form');
    const btnSubmit = document.getElementById('btn-submit');
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
    const fridgeInput = document.getElementById('fridge-input');
    const btnAddFridge = document.getElementById('btn-add-fridge');
    const fridgeTagsContainer = document.getElementById('fridge-tags-container');
    const btnGenerateWeek = document.getElementById('btn-generate-week');

    // 狀態暫存庫
    let fridgeIngredients = ['雞蛋', '高麗菜', '豬肉', '洋蔥', '豆腐', '青江菜'];
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

        renderFridgeTags();
        renderHistory();
    }

    // 模組功能：分頁切換
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('none', 'active'));
            
            button.classList.add('active');
            const activeTabId = button.getAttribute('data-tab');
            document.getElementById(activeTabId).classList.add('active');
        });
    });

    // 模組功能：冰箱食材增刪管理
    function renderFridgeTags() {
        fridgeTagsContainer.innerHTML = '';
        fridgeIngredients.forEach((item, index) => {
            const tag = document.createElement('div');
            tag.className = 'ingredient-tag';
            tag.innerHTML = `${item} <span data-index="${index}">&times;</span>`;
            fridgeTagsContainer.appendChild(tag);
        });
    }

    btnAddFridge.addEventListener('click', () => {
        const value = fridgeInput.value.trim();
        if (value && !fridgeIngredients.includes(value)) {
            fridgeIngredients.push(value);
            fridgeInput.value = '';
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

    // 複製與下載機制
    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(recipeContent.innerText)
            .then(() => alert('📋 內容已成功複製到剪貼簿！'))
            .catch(() => alert('複製失敗，請手動全選複製。'));
    });

    btnDownload.addEventListener('click', () => {
        const rawText = recipeContent.innerText;
        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI_智能料理企劃案_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    /**
     * 核心兩階段流程 - 階段一：生成多個可行料理方案
     */
    recipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorAlert.classList.add('hidden');
        proposalView.classList.add('hidden');
        resultView.classList.add('hidden');

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) { return showError('請先輸入有效的 Gemini API Key。'); }
        localStorage.setItem('gemini_cooking_key', apiKey);

        const selectedEquipments = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(el => el.value).join('、');
        const selectedNutritions = Array.from(document.querySelectorAll('input[name="nutrition"]:checked')).map(el => el.value).join('、');

        lastSavedConfig = {
            cuisineType: document.getElementById('cuisine-type').value,
            mealPeriod: document.getElementById('meal-period').value,
            budget: document.getElementById('budget').value,
            availableTime: document.getElementById('available-time').value,
            ingredients: document.getElementById('ingredients').value.trim(),
            servings: document.getElementById('servings').value,
            tasteProfile: document.getElementById('taste-profile').value,
            targetAudience: document.getElementById('target-audience').value,
            aiMode: document.getElementById('ai-mode').value,
            allergyExclude: document.getElementById('allergy-exclude').value,
            equipments: selectedEquipments || '基本廚具',
            nutritions: selectedNutritions || '平衡膳食'
        };

        setLoading(true, 'AI 主廚正在篩選多組可行方案...', '正在依據您的預算、時間與過敏原計算最佳套餐配比。');

        const proposalPrompt = `你是一位專業主廚與嚴格的營養師。請根據以下要求，設計出 3 個完全符合條件的「主菜+副菜+湯品」套餐方案，供使用者挑選。
條件：
- 料理類型: ${lastSavedConfig.cuisineType} | 時段: ${lastSavedConfig.mealPeriod}
- 預算: ${lastSavedConfig.budget}元 TWD | 時間: ${lastSavedConfig.availableTime}
- 現有食材: ${lastSavedConfig.ingredients}
- 份數: ${lastSavedConfig.servings} | 口味: ${lastSavedConfig.tasteProfile}
- 對象: ${lastSavedConfig.targetAudience} | 模式: ${lastSavedConfig.aiMode}
- 過敏原排除: ${lastSavedConfig.allergyExclude}
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
    "feature": "此套餐與口味、營養目標的搭配亮點特色"
  }
]`;

        try {
            const rawJson = await callGemini(apiKey, proposalPrompt);
            // 清理可能夾帶的 markdown 標籤
            const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
            currentProposals = JSON.parse(cleanJson);
            
            renderProposals(currentProposals);
        } catch (err) {
            showError('方案解析失敗。這通常是因為模型未按預期輸出純 JSON 格式。錯誤訊息：' + err.message);
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
     * 核心兩階段流程 - 階段二：選定方案，輸出全套結構化細節與食譜
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

        const recipeDetailedPrompt = `你是一位擁有頂級證照的主廚、資深臨床營養師，以及食品科學顧問。
請針對使用者選定的套餐方案：【${chosenProposal.title}】，根據以下背景規格，輸出極為詳盡的完整食譜企劃：
- 導航模式: ${lastSavedConfig.aiMode} (必須嚴格遵照此模式之要求深度輸出)
- 料理對象與口味: 專為 ${lastSavedConfig.targetAudience} 客製，口味調配設定為 ${lastSavedConfig.tasteProfile}
- 限制條件: 預算 ${lastSavedConfig.budget}元內、時間 ${lastSavedConfig.availableTime}內、排除過敏原 ${lastSavedConfig.allergyExclude}
- 設備配置: ${lastSavedConfig.equipments}

請使用完美、整齊的 Markdown 語法輸出以下限定結構，不得遺漏：

## 🏆 套餐核心企劃：${chosenProposal.title}

### 💡 套餐均衡度與料理對象分析
[深入闡述本套餐在主菜、副菜與湯品之間的口味平衡、營養相性，並詳述為何完美契合 ${lastSavedConfig.targetAudience} 的生理需求]

### 🛒 整合式食材清單與價格精算 (${lastSavedConfig.servings}份量)
| 食材分類 | 食材名稱 | 精確規格/重量 | 預估採買價格 (TWD) |
| :--- | :--- | :--- | :--- |
| 主菜/副菜/湯品 | ... | ... | ... |

**預估總成本：** NT$ [填入數字]
**整合準備時間：** [填入] | **整合烹飪時間：** [填入]

### 🍳 三道式全套烹飪程序 (${lastSavedConfig.aiMode} 深度)
#### 🥩 主菜料理步驟
1. ...
#### 🥗 副菜料理步驟
1. ...
#### 🥣 湯品料理步驟
1. ...

### 🧂 核心口味調整與黃金調味配比 (${lastSavedConfig.tasteProfile} 調配)
[詳細列出所有核心調味料的精確比例，並說明如何達到極致平衡]

### ⚠️ 廚房設備分析、防錯替代做法與防護提醒
[針對廚具設備【${lastSavedConfig.equipments}】進行限制解析，說明如何利用基礎鍋具進行完美替代，並給出操作安全防護提示]

### 📊 全套套餐精密營養與健康指標標示 (${lastSavedConfig.servings}份量總和)
- 總熱量: [填入] kcal
- 蛋白質: [填入] g
- 脂肪: [填入] g
- 飽和脂肪: [填入] g
- 碳水化合物: [填入] g
- 糖: [填入] g
- 鈉含量: [填入] mg
- 膳食纖維: [填入] g

### 🥗 臨床健康優點 (針對目標需求 ${lastSavedConfig.nutritions} 給出至少 3 點詳細分析)
1. ...
2. ...
3. ...

### ❌ 潛在缺點與特定族群飲食注意 (給出至少 3 點詳細分析)
1. ...
2. ...
3. ...

### 🔬 專業烹飪技巧與食品科學原理 (給出至少 5 點詳細分析，如梅納反應、蛋白質變性控制、澱粉糊化等)
1. ...
2. ...
3. ...
4. ...
5. ...

### ⚠️ 常見失敗原因深度剖析 (至少 3 點)
1. ...

### 🔄 彈性食材替代與升級方案 (針對過敏或買不到食材提供至少 3 種替換建議，如：牛奶 $\rightarrow$ 豆漿)
1. ...

### 📦 最佳保存方式與無損回熱方法
- **冷藏限制天數：** [填入] 天 | **冷凍限制天數：** [填入] 天
- **多元回熱技巧：** [詳細說明微波、電鍋或平底鍋的無損回熱技巧]`;

        try {
            const rawMarkdown = await callGemini(apiKey, recipeDetailedPrompt);
            const endTime = performance.now();
            const timeCost = ((endTime - startTime) / 1000).toFixed(2);

            document.getElementById('result-main-title').innerText = `🍽️ 全套套餐：${chosenProposal.title}`;
            conditionSummary.innerHTML = `
                <strong>📊 套用高階分析條件：</strong> 
                模式：<span class="tag">${lastSavedConfig.aiMode}</span> | 
                口味：<span class="tag">${lastSavedConfig.tasteProfile}</span> | 
                對象：<span class="tag">${lastSavedConfig.targetAudience}</span> | 
                過敏原排除：<span class="tag">${lastSavedConfig.allergyExclude}</span>
            `;
            aiMeta.innerHTML = `⏱️ 頂級 AI 深度分析耗時：${timeCost} 秒 | 模型規格：Gemini 2.5 Flash`;
            recipeContent.innerHTML = customMarkdownParser(rawMarkdown);

            resultView.classList.remove('hidden');
            resultView.scrollIntoView({ behavior: 'smooth' });

            // 儲存至歷史紀錄
            saveToHistoryList(chosenProposal.title, rawMarkdown, lastSavedConfig, timeCost);
        } catch (err) {
            showError('詳細食譜生成失敗：' + err.message);
        } finally {
            setLoading(false);
        }
    });

    /**
     * 新增獨立功能區：🧊 冰箱料理規劃器 - 一週菜單生成
     */
    btnGenerateWeek.addEventListener('click', async () => {
        errorAlert.classList.add('hidden');
        resultView.classList.add('hidden');
        proposalView.classList.add('hidden');

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) return showError('請先輸入有效的 Gemini API Key。');
        localStorage.setItem('gemini_cooking_key', apiKey);

        if (fridgeIngredients.length === 0) {
            return showError('您的冰箱空空如也！請先在上方新增一些食材。');
        }

        const totalBudget = document.getElementById('fridge-budget').value;
        const fridgeMode = document.getElementById('fridge-mode').value;

        setLoading(true, 'AI 食材管理專家正在規劃一週精準菜單...', '優化食材消耗比例，全面防範食材過期與浪費，精算購物清單中...');
        const startTime = performance.now();

        const fridgePrompt = `你是一位專業營養師、星級主廚與高階食材管理專家。
現在已知使用者冰箱裡有以下「現有食材」：【${fridgeIngredients.join('、')}】。
請以此為基礎，為使用者設計一份高彈性、高食材利用率、且總預算控制在 TWD $${totalBudget} 元以內的「一週菜單（7天，週一至週日，每日包含早餐、午餐、晚餐）」。

請注意以下最高指導原則：
1. 必須「優先且重複循環使用」現有食材，最大化提升使用率，將浪費比例降到最低。
2. 每天套餐結構須維持口味平衡，且避免連續兩頓吃一模一樣的料理。
3. 清楚抓出哪些食材是冰箱沒有、需要額外去超市購買的，並整合出購物清單與估價。

請嚴格遵循以下 Markdown 格式輸出，並使用我們提供的專用收合結構語法 [[[星期X]]] 來包裝每天的菜單：

## 🧊 冰箱規劃：一週智慧黃金菜單

[[[星期一]]]
- **早餐：** [填入餐點名稱] (食材包含...)
- **午餐：** [填入餐點名稱] (食材包含...)
- **晚餐：** [填入餐點名稱與主副湯結構]
- **本日精算熱量：** [填入] kcal
[[[星期二]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...
[[[星期三]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...
[[[星期四]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...
[[[星期五]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...
[[[星期六]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...
[[[星期日]]]
- **早餐：** ...
- **午餐：** ...
- **晚餐：** ...
- **本日精算熱量：** ...

---

## 🛒 自動化補給購物清單 (一週份)
請列出為了補足這 7 天菜單所缺少、必須購買的食材與調味料：
- [ ] [食材名稱1] | 預估所需數量 | 預估價格 (TWD)
- [ ] [食材名稱2] | 預估所需數量 | 預估價格 (TWD)

**合計採買追加預算：** NT$ [填入總計金額]

---

## 📊 食材利用率與消耗全盤分析
- **現有食材使用率：** [填入百分比]%
- **剩餘未用完食材：** [列出項目與安全保存天數]
- **後續延長保存與再利用料理建議：** [詳細說明如何不浪費殘料的廚藝妙招]`;

        try {
            const rawMarkdown = await callGemini(apiKey, fridgePrompt);
            const endTime = performance.now();
            const timeCost = ((endTime - startTime) / 1000).toFixed(2);

            document.getElementById('result-main-title').innerText = `🧊 冰箱規劃：一週全能菜單方案`;
            conditionSummary.innerHTML = `<strong>📊 冰箱管理配置：</strong> 導向模式：<span class="tag">${fridgeMode}</span> | 預算上限：<span class="tag">$${totalBudget} TWD</span>`;
            aiMeta.innerHTML = `⏱️ 冰箱大數據整合耗時：${timeCost} 秒 | 模型規格：Gemini 2.5 Flash`;
            
            // 渲染並解析特殊的週菜單摺疊元件
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
     * 底層 API 串接：使用 fetch 搭配 async/await 與超時防護機制
     */
    async function callGemini(apiKey, prompt) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 延長至60秒以應付超大文本

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 400 || response.status === 403) {
                throw new Error('API Key 錯誤或已失效，請前往 Google AI Studio 重新複製正確的金鑰。');
            }
            throw new Error(`伺服器回應異常，狀態碼：${response.status}`);
        }

        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Markdown 轉高效 HTML 渲染引擎 (包含擴充週曆收合模組)
    function customMarkdownParser(mdText) {
        let lines = mdText.split('\n');
        let htmlOutput = [];
        let inList = false;
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();

            // 處理專用收合語法 [[[星期X]]]
            if (trimmed.startsWith('[[[') && trimmed.endsWith(']]]')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                if (inTable) { htmlOutput.push('</tbody></table>'); inTable = false; }
                const dayName = trimmed.replace('[[[', '').replace(']]]', '');
                
                // 如果不是第一個收合，先閉合上一個 content 區塊
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

            // 標準表格判定
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

            // 標題判定
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

            // 清單判定
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

        // 閉合所有防禦性標籤
        if (inTable) htmlOutput.push('</tbody></table>');
        if (inList) htmlOutput.push('</ul>');
        if (mdText.includes('[[[')) htmlOutput.push('</div></div>'); // 閉合最後一天的摺疊卡片

        return htmlOutput.join('');
    }

    function parseInline(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    // 歷史存檔控制
    function saveToHistoryList(name, text, params, timeCost) {
        const item = {
            id: Date.now(),
            dishName: name,
            timestamp: new Date().toLocaleString('zh-TW'),
            rawMarkdown: text,
            params: params,
            timeCost: timeCost
        };
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
