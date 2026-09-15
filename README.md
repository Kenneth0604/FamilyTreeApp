# 家族樹 FamilyTreeApp

多人協作的家族樹 PWA。從自己出發,一層層把父母、兄弟姊妹、配偶、子女加進去,系統自動用**台灣慣用中文親屬稱謂**標示每個人與「目前檢視視角」的關係(例如:從自己拉出爸爸、再從爸爸拉出弟弟,系統自動標示「叔叔」)。

- 前端:React 19 + Vite + Tailwind CSS v4,HashRouter(方便部署到 GitHub Pages)
- 樹狀圖:React Flow(`@xyflow/react`)+ 自訂的世代分層排版
- 後端:Supabase(Postgres + RLS + Realtime + Storage + Auth)
- 部署:GitHub Actions → GitHub Pages
- PWA:manifest + Service Worker,可加到手機主畫面、離線可看已快取的資料
- 架構沿用既有專案 MissionApp

---

## 功能總覽

| 區塊 | 內容 |
| --- | --- |
| 帳號 | 帳號 + 密碼(Supabase Auth)。首次登入建立新家族,或輸入 6 碼邀請碼 / 查看碼(或點連結)加入;一個帳號可加入多個家族並隨時切換 |
| 家族群組 | 一個家族樹屬於一個 family。**邀請碼**加入的成員可共同新增、編輯;**查看碼**加入的成員只能瀏覽(RLS 強制)。每筆資料記錄 created_by / updated_by,詳細頁顯示「最後由誰編輯」 |
| 樹狀圖 | 以視角為中心、依世代分層(配偶並排、子女在下一層),節點顯示大頭照 / 姓名 / 稱謂,點節點看詳細 |
| 成員列表 | 搜尋姓名或稱謂,依世代分組,卡片顯示姓名、稱謂、年齡、大頭照 |
| 新增 / 編輯 | 姓名、性別、生日(可只填年份)、是否過世、大頭照、備註;新增時選「跟樹上哪位成員是什麼關係」(父母 / 子女 / 配偶 / 兄弟姊妹)。選兄弟姊妹但對方沒有父母時,自動建立可稍後補資料的父 / 母佔位節點 |
| 詳細頁 | 基本資料、與視角的稱謂(含推算路徑)、管理父母 / 配偶(含婚姻狀態)/ 子女關係、兄弟姊妹(自動推算) |
| 設定 | 切換視角(我是誰)、綁定帳號的真實身分、進階稱謂模式、邀請碼與查看碼管理(分享 / 重新產生,僅可編輯成員可見)、家族名稱、主題(粉粉 / 黑黑)、切換家族、離開家族 |
| 即時同步 | Supabase Realtime + 60 秒輪詢 + 回到前景時重抓 |

---

## 稱謂計算引擎

核心模組在 [`src/lib/kinship/`](src/lib/kinship/),是**純函式、可獨立測試**:

```js
import { buildGraph, computeRelationTerm, computeAllRelationTerms } from './lib/kinship/index.js'

const graph = buildGraph({ people, parentChild, spouses })
computeRelationTerm(viewpointId, targetId, graph, { advanced: false })
// → { term: '叔叔', kind: 'exact', needsBirthday: false, path: [...], generation: -1 }
```

### 原理

1. 圖上只有兩種邊:`parent_child`(有方向)與 `spouse`(無方向)。兄弟姊妹、叔伯、堂表…都不另外儲存。
2. 以 BFS 找 viewpoint → target 的**最短路徑**(parent_child 邊雙向可走;離婚的 spouse 邊不走)。等長路徑優先選**經過 spouse 邊最少**的(純血緣優先)。
3. 路徑拆成原子步驟 U(往上到父母)/ D(往下到子女)/ S(配偶),組成 code,例如 `UD` = 兄弟姊妹、`UUD` = 父母的兄弟姊妹、`UUDD` = 堂表親、`SUD` = 配偶的兄弟姊妹。
4. 依四個維度決定字:**世代差**、**父系 / 母系**(路徑往上經過爸爸還是媽媽)、**相對年齡**(比較 birth_date)、**性別**(target 本人與路徑上連接血親的性別)。

### 回傳的 `kind`

| kind | 意義 | UI 樣式 |
| --- | --- | --- |
| `exact` | 對照表中的固定稱謂 | 正常 |
| `approx` | 有對應但缺生日 / 性別未指定,退為中性詞(「兄弟姊妹」「叔伯」「配偶」),`needsBirthday` 為 true 時提示填生日 | 黃色 + `?` |
| `fallback` | 表中沒有固定稱謂,以「表姊的兒子」這種組合式描述呈現(找最長可解析的前綴,其餘以中繼人物為視角遞迴) | 淡色斜體 |
| `self` | 自己 | — |

不相連的人回傳 `null`(UI 顯示「未連結」)。

### 基本模式涵蓋

直系(爸爸 / 媽媽 / 兒子 / 女兒 / 爺爺 / 奶奶 / 外公 / 外婆 / 孫子 / 孫女 / 外孫 / 外孫女)、配偶(先生 / 太太 / 前夫 / 前妻)、同輩(哥哥 / 弟弟 / 姊姊 / 妹妹)、父母的兄弟姊妹及其配偶(伯伯 / 叔叔 / 伯母 / 嬸嬸 / 姑姑 / 姑丈 / 舅舅 / 舅媽 / 阿姨 / 姨丈)、兄弟姊妹的配偶(嫂嫂 / 弟媳 / 姊夫 / 妹夫)與孩子(姪子 / 姪女 / 外甥 / 外甥女)、第一代堂表親(堂哥 / 堂姊 / 堂弟 / 堂妹 / 表哥 / 表姊 / 表弟 / 表妹)、配偶的直系與同輩姻親(岳父 / 岳母 / 大舅子 / 小舅子 / 大姨子 / 小姨子;公公 / 婆婆 / 大伯 / 小叔 / 大姑 / 小姑)、媳婦 / 女婿、繼父 / 繼母 / 繼子 / 繼女。

### 進階模式額外涵蓋

曾祖父母 / 曾孫、高祖父母 / 玄孫、伯公 / 叔公 / 姑婆 / 舅公 / 姨婆(及其配偶)、堂姪 / 表姪、堂伯 / 堂叔 / 表姑 / 表舅…、再堂 / 再表兄弟姊妹、堂嫂 / 表姊夫等堂表親配偶、孫媳婦 / 孫女婿、姪孫、妯娌、連襟、親家公 / 親家母、配偶的姪甥。

### 測試

```bash
npm test
```

[`src/lib/kinship/terms.test.js`](src/lib/kinship/terms.test.js) 以「先建 fixture 再斷言字串」的方式覆蓋:核心家庭、祖孫兩代、父系與母系的伯叔姑舅姨、第一代堂表親、配偶雙方的姻親、缺 birth_date 的 fallback、進階模式的曾祖 / 曾孫、組合式描述、離婚 / 喪偶 / 半血緣 / 同性婚姻等邊界情況。

---

## 資料模型

| 表 | 說明 |
| --- | --- |
| `families` | id, name, invite_code(唯一、可重新產生) |
| `family_members` | 帳號 × 家族的身分:display_name、self_person_id、viewpoint_person_id、advanced_terms |
| `people` | name、gender(male / female / unspecified)、birth_date(文字,`YYYY` / `YYYY-MM` / `YYYY-MM-DD` 或 null)、is_deceased、avatar_url、note、created_by / updated_by / updated_at |
| `parent_child` | parent_id → child_id |
| `spouses` | person_a_id、person_b_id、status(married / divorced / widowed) |

RLS:所有表以 `is_family_member(family_id)` 判斷讀取,寫入另需 `is_family_editor(family_id)`(`family_members.role = 'editor'`);`families.invite_code` / `view_code` 只能由 editor 透過 `family_codes` RPC 取得。建立家族 / 加入(`join_family` = editor、`join_family_as_viewer` = viewer)/ 重新產生兩種碼都透過 security definer 的 RPC。

---

## 一、Supabase 設定

1. 建立 Supabase 專案。
2. **Authentication → Providers → Email**:確認啟用。若不想處理驗證信,可關閉「Confirm email」;若要保留,請把 **Authentication → URL Configuration → Site URL** 設為 `https://<你的帳號>.github.io/FamilyTreeApp/`,驗證後才會導回 App。
3. **SQL Editor** 貼上並執行 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)(建表、RLS、RPC、Storage bucket `avatars`、Realtime publication、keep-alive)。
4. 到 **Project Settings → API** 取得 `Project URL` 與 `anon public key`。

## 二、本機開發

```bash
npm install
cp .env.example .env.local   # 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173/FamilyTreeApp/
npm test                     # 稱謂引擎 + 排版單元測試
npm run build
```

## 三、部署到 GitHub Pages

1. Repo → Settings → Secrets and variables → Actions,新增 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
2. Repo → Settings → Pages → Source 選 **GitHub Actions**。
3. 推送到 `main` 即自動測試、建置、部署([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml));網址:

```
https://kenneth0604.github.io/FamilyTreeApp/
```

> 若 repo 改名,請同步修改 `vite.config.js` 的 `BASE`、`public/manifest.json`、`index.html` 與 `src/sw.js` 內的 `/FamilyTreeApp/`。

### Keep-alive

Supabase 免費方案 7 天沒有 API 活動會暫停專案。[`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) 每 3 天呼叫一次 `rpc/keep_alive`,使用與部署相同的兩個 secrets。GitHub 對 60 天沒有 commit 的 repo 會停用排程,屆時到 Actions 頁點 **Enable workflow** 即可。

---

## 專案結構

```
src/
  lib/kinship/        稱謂引擎(graph.js BFS、terms.js 規則表、birth.js 生日比較)+ 測試
  lib/treeLayout.js   樹狀圖世代分層排版
  lib/store.jsx       Auth / 家族 / 資料載入 / Realtime / 寫入
  lib/images.js       大頭照裁切壓縮上傳(Storage bucket avatars)
  pages/              Login、FamilyGate(建立 / 加入)、Tree、People、PersonForm、PersonDetail、Settings
  components/         Layout、Avatar、TermBadge、PersonPicker、AvatarUploader、PersonCard…
supabase/migrations/  0001_init.sql
scripts/make-icons.mjs  產生 PWA 圖示(npm run icons)
```
