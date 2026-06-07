/**
 * AI 料理小幫手核心控制引擎
 * 完全無後端依賴，直連 Gemini API 進行結構化科學食譜生成
 */

document.addEventListener('DOMContentLoaded', () => {
    // 界面元件初始化
    const recipeForm = document.getElementById('recipe-form');
    const apiKeyInput = document.getElementById('api-key');
    const btnSubmit = document.getElementById('btn-submit');
    const loadingView = document.getElementById('loading-view');
    const resultView = document.getElementById('result-view');
    const recipeContent = document.getElementById('recipe-content');
    const conditionSummary = document.getElementById('condition-summary');
    const aiMeta = document.getElementById('ai-meta');
    
    // 錯誤與控制元件
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    const closeErrorBtn = document.getElementById('close-error');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const historyList = document.getElementById('history-list');

    // 歷史資料儲存庫
    let recipeHistory = JSON.parse(localStorage.getItem('cooking_assistant_history')) || [];

    // 初始化載入
    initApp();

    function initApp() {
        // 載入儲存的 API Key
        const savedKey = localStorage.getItem('gemini_cooking_key');
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }

        // 載入儲存的主題模式
        const savedTheme = localStorage.getItem('cooking_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);

        renderHistory();
    }

    // 主題切換事件
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('cooking_theme', newTheme);
    });

    // 關閉錯誤視窗
    closeErrorBtn.addEventListener('click', () => {
        errorAlert.classList.add('hidden');
    });

    // 清空歷史紀錄
    btnClearHistory.addEventListener('click', () => {
        if(confirm('確定要清空所有歷史食譜紀錄嗎？')) {
            recipeHistory = [];
            localStorage.setItem('cooking_assistant_history', JSON.stringify(recipeHistory));
            renderHistory();
        }
    });

    // 複製內容功能
    btnCopy.addEventListener('click', () => {
        const rawText = recipeContent.innerText;
        navigator.clipboard.writeText(rawText)
            .then(() => alert('📋 食譜內容已成功複製到剪貼簿！'))
            .catch(() => alert('無法複製內容，請手動全選複製。'));
    });

    // 下載文字檔食譜
    btnDownload.addEventListener('click', () => {
        const titleElement = recipeContent.querySelector('h2');
        const dishName = titleElement ? titleElement.innerText.replace('🏆 主要推薦料理：', '').trim() : 'AI客製化食譜';
        const rawText = recipeContent.innerText;
        
        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dishName}_食譜企劃方案.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 表單提交處理
    recipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorAlert.classList.add('hidden');

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showError('請輸入有效的 Gemini API Key。');
            return;
        }
        localStorage.setItem('gemini_cooking_key', apiKey);

        // 彙整複選欄位
        const selectedEquipments = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(el => el.value);
        const selectedNutritions = Array.from(document.querySelectorAll('input[name="nutrition"]:checked')).map(el => el.value);

        const configPayload = {
            cuisineType: document.getElementById('cuisine-type').value,
            mealPeriod: document.getElementById('meal-period').value,
            budget: document.getElementById('budget').value,
            availableTime: document.getElementById('available-time').value,
            ingredients: document.getElementById('ingredients').value.trim(),
            servings: document.getElementById('servings').value,
            tasteProfile: document.getElementById('taste-profile').value,
            targetAudience: document.getElementById('target-audience').value,
            equipments: selectedEquipments.length > 0 ? selectedEquipments.join('、') : '基本平底鍋與炒鍋',
            nutritions: selectedNutritions.length > 0 ? selectedNutritions.join('、') : '無特殊需求'
        };

        // 顯示加載動畫，鎖定按鈕
        setLoadingState(true);
        const startTime = performance.now();

        try {
            const aiResponseText = await callGemini(apiKey, configPayload);
            const endTime = performance.now();
            const processTime = ((endTime - startTime) / 1000).toFixed(2);

            // 更新畫面呈現
            displayRecipeResult(aiResponseText, configPayload, processTime);

            // 加入歷史紀錄
            saveToHistory(aiResponseText, configPayload, processTime);

        } catch (error) {
            console.error(error);
            showError(error.message || '連線至 Gemini 伺服器超時或發生未知異常，請檢查網路或 API Key 的可用性。');
        } finally {
            setLoadingState(false);
        }
    });

    /**
     * 封裝 Gemini API 連線處理的核心獨立函式
     * 使用標準的 fetch() 與 async/await 架構
     */
    async function callGemini(apiKey, params) {
        // 核心大型 Prompt 工程設計模組
        const systemPrompt = `你是一位專業主廚、營養師、料理老師、食品科學專家與家庭料理顧問。
你的任務是根據使用者提供的高度客製化限制條件，進行全面科學的料理結構優化分析，並回傳一份極為詳盡的料理方案。

請嚴格根據以下使用者指定的維度進行全盤調配：
- 料理類型: ${params.cuisineType}
- 用餐時段: ${params.mealPeriod}
- 預算限制: ${params.budget}元 TWD
- 可用時間: ${params.availableTime}
- 現有食材: ${params.ingredients} (你必須優先以此作為核心食材切入)
- 料理份數: ${params.servings} (你必須依此份數精確計算食材用量、料理時間與總成本)
- 預期口味: ${params.tasteProfile} (你必須針對調味料的比例與分配給出具體科學建議)
- 擁有設備: ${params.equipments} (你必須分析設備限制，如非使用此設備，需提出安全替代做法與操作注意事項)
- 營養需求: ${params.nutritions} (你必須依此需求調整食譜結構，例如：高蛋白則增加肉蛋量、低鈉則控制鹽分，並作配比標示)
- 料理對象: ${params.targetAudience} (你必須分析並推薦適合該對象的口味軟硬度、食材安全搭配與原因)

你回覆的內容必須完全採用 Markdown 格式輸出，且必須包含兩道料理：一道「主要推薦料理」與一道「備選料理」，回答絕不能精簡，必須非常豐富、實用且完整。

請嚴格依照下方規定的標題架構與順序輸出，不得跳過或修改這些標題：

## 🏆 主要推薦料理：[填入主要菜名]

### 💡 推薦原因與料理特色
[請依料理對象、營養需求、時段與現有食材的關聯深入闡述原因與特色]

### 🛒 食材表 (${params.servings}份量)
請使用以下 Markdown 表格格式輸出，必須準確預估食材在此份量下的台幣價格：
| 食材 | 份份 | 價格 |
| :--- | :--- | :--- |
| 食材名稱 | 具體克數/計量單位 | 預估價格 (TWD) |

**預估總成本：** NT$ [填入數字]
**準備時間：** [填入時間] | **烹飪時間：** [填入時間]

### 🍳 完整食譜與科學步驟
1. 步驟1...
2. 步驟2...

### 🧂 口味調整建議
[針對特定的 ${params.tasteProfile} 口味，詳細列出調味料增減與黃金比例分配的理由]

### ⚠️ 廚房設備分析、替代做法與注意事項
[分析 ${params.equipments} 的限制，說明若無特殊廚具應如何使用基本鍋具替代，並提出烹飪安全與防燙/防爆提醒]

### 📊 卡路里與營養標示 (${params.servings}份量總和)
- 熱量: [數字] kcal
- 蛋白質: [數字] g
- 脂肪: [數字] g
- 飽和脂肪: [數字] g
- 碳水化合物: [數字] g
- 糖: [數字] g
- 鈉: [數字] mg
- 膳食纖維: [數字] g

### 🥗 健康優點 (請列出至少 3 點詳細分析)
1. ...
2. ...
3. ...

### ❌ 缺點或飲食注意 (請列出至少 3 點詳細分析)
1. ...
2. ...
3. ...

### 💡 專業烹飪技巧與食品科學原理 (請列出至少 5 點詳細分析，例如梅納反應、蛋白質變性控制等)
1. ...
2. ...
3. ...
4. ...
5. ...

### ⚠️ 常見失敗原因分析 (請列出至少 3 點)
1. ...
2. ...
3. ...

### 🔄 食材替代方案 (請列出至少 3 種常見替換方法)
1. ...
2. ...
3. ...

### 📦 保存方式與回熱方法
- **冷藏天數：** [填入天數]
- **冷凍天數：** [填入天數]
- **回熱方法：** [詳細說明微波、電鍋或平底鍋的無損回熱技巧]

---

## 🥈 備選料理：[填入備選菜名]
[此處請提供第二道替代菜餚的推薦原因、料理特色與簡要的做法步驟，格式亦須保持結構完整，不敷衍]`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // 設置 AbortController 以進行 50 秒的 Timeout 控制機制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 50000);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: systemPrompt }]
                }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (response.status === 400 || response.status === 403) {
                throw new Error(`API 金鑰無效或授權失敗 (代碼 ${response.status})。請確認您的 Gemini API Key 是否正確輸入。`);
            }
            throw new Error(errData?.error?.message || `伺服器連線中斷，狀態碼：${response.status}`);
        }

        const data = await response.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!aiText) {
            throw new Error('Gemini API 未成功產生文本內容，請重新嘗試提交。');
        }

        return aiText;
    }

    // 渲染生成結果到前端
    function displayRecipeResult(rawMarkdown, params, timeCost) {
        conditionSummary.innerHTML = `
            <strong>📊 目前套用的分析條件摘要：</strong><br>
            料理：<span class="tag">${params.cuisineType} (${params.mealPeriod})</span> | 
            預算：<span class="tag">$${params.budget} TWD</span> | 
            時間上限：<span class="tag">${params.availableTime}</span> | 
            份數：<span class="tag">${params.servings}</span> | 
            口味：<span class="tag">${params.tasteProfile}</span> | 
            對象：<span class="tag">${params.targetAudience}</span><br>
            食材：${params.ingredients}<br>
            設備：${params.equipments} | 飲食需求：${params.nutritions}
        `;

        aiMeta.innerHTML = `⏱️ AI 核心深度分析耗時：${timeCost} 秒 | 使用核心模型：Gemini 1.5 Flash`;
        
        // 解析 Markdown 表記法並渲染至 DOM 容器
        recipeContent.innerHTML = customMarkdownParser(rawMarkdown);
        resultView.classList.remove('hidden');
        resultView.scrollIntoView({ behavior: 'smooth' });
    }

    // 將資料保存至 LocalStorage
    function saveToHistory(text, params, timeCost) {
        const titleRegex = /##\s+🏆\s*主要推薦料理：\s*(.*)\n/;
        const match = text.match(titleRegex);
        const dishName = match ? match[1].trim() : '未命名精選料理';

        const historyItem = {
            id: Date.now(),
            dishName: dishName,
            timestamp: new Date().toLocaleString('zh-TW'),
            rawMarkdown: text,
            params: params,
            timeCost: timeCost
        };

        recipeHistory.unshift(historyItem);
        // 最多保留 15 筆
        if (recipeHistory.length > 15) recipeHistory.pop();

        localStorage.setItem('cooking_assistant_history', JSON.stringify(recipeHistory));
        renderHistory();
    }

    // 渲染歷史紀錄清單
    function renderHistory() {
        historyList.innerHTML = '';
        if (recipeHistory.length === 0) {
            historyList.innerHTML = '<li class="text-muted text-center" style="padding: 15px;">尚無任何歷史推薦紀錄</li>';
            return;
        }

        recipeHistory.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <strong>${item.dishName}</strong>
                <span class="text-muted" style="font-size:0.8rem;">${item.timestamp}</span>
            `;
            li.addEventListener('click', () => {
                displayRecipeResult(item.rawMarkdown, item.params, item.timeCost);
                resultView.scrollIntoView({ behavior: 'smooth' });
            });
            historyList.appendChild(li);
        });
    }

    // 狀態切換器
    function setLoadingState(isLoading) {
        if (isLoading) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = '⏳ 正在調配食材與撰寫食譜...';
            loadingView.classList.remove('hidden');
            resultView.classList.add('hidden');
        } else {
            btnSubmit.disabled = false;
            btnSubmit.innerText = '🍽️ 生成智能食譜';
            loadingView.classList.add('hidden');
        }
    }

    // 友善錯誤顯示
    function showError(message) {
        errorMessage.innerText = message;
        errorAlert.classList.remove('hidden');
        errorAlert.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * 高穩定度輕量 Markdown 渲染器
     * 支持標題、粗體、區塊換行、清單與標準 Markdown 表格轉換
     */
    function customMarkdownParser(mdText) {
        let lines = mdText.split('\n');
        let htmlOutput = [];
        let inList = false;
        let inTable = false;
        let tableHeaderRead = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();

            // 處理表格判定 (|...|...|)
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                
                // 跳過分隔線層 (例如 | :--- | :--- |)
                if (trimmed.includes('---') || trimmed.includes('-:-')) {
                    continue;
                }

                const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
                
                if (!inTable) {
                    inTable = true;
                    htmlOutput.push('<table><thead><tr>');
                    cells.forEach(cell => {
                        htmlOutput.push(`<th>${applyInlineFormatting(cell)}</th>`);
                    });
                    htmlOutput.push('</tr></thead><tbody>');
                } else {
                    htmlOutput.push('<tr>');
                    cells.forEach(cell => {
                        htmlOutput.push(`<td>${applyInlineFormatting(cell)}</td>`);
                    });
                    htmlOutput.push('</tr>');
                }
                continue;
            } else {
                if (inTable) {
                    htmlOutput.push('</tbody></table>');
                    inTable = false;
                }
            }

            // 處理大標題 (##)
            if (trimmed.startsWith('## ')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                htmlOutput.push(`<h2>${applyInlineFormatting(trimmed.substring(3))}</h2>`);
                continue;
            }

            // 處理小標題 (###)
            if (trimmed.startsWith('### ')) {
                if (inList) { htmlOutput.push('</ul>'); inList = false; }
                htmlOutput.push(`<h3>${applyInlineFormatting(trimmed.substring(4))}</h3>`);
                continue;
            }

            // 處理無序列表 (1. 或 -)
            const listMatch = trimmed.match(/^(\d+\.|-)\s+(.*)/);
            if (listMatch) {
                if (!inList) {
                    htmlOutput.push('<ul>');
                    inList = true;
                }
                htmlOutput.push(`<li>${applyInlineFormatting(listMatch[2])}</li>`);
                continue;
            } else {
                if (inList) {
                    htmlOutput.push('</ul>');
                    inList = false;
                }
            }

            // 處理空白行或水平分割線
            if (trimmed === '' || trimmed === '---') {
                if (trimmed === '---') htmlOutput.push('<hr class="divider">');
                continue;
            }

            // 一般段落文字
            htmlOutput.push(`<p>${applyInlineFormatting(trimmed)}</p>`);
        }

        // 結尾收尾防禦
        if (inTable) htmlOutput.push('</tbody></table>');
        if (inList) htmlOutput.push('</ul>');

        return htmlOutput.join('');
    }

    // 內嵌粗體與高亮語意處理
    function applyInlineFormatting(text) {
        // 替換星號粗體為 strong 標籤
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return formatted;
    }
});
