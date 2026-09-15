import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, authEmailToUsername } from '../lib/store.jsx'
import { useTheme, THEMES } from '../lib/theme.jsx'
import { useToast } from '../lib/toast.jsx'
import PersonPicker from '../components/PersonPicker.jsx'

export default function Settings() {
  const store = useStore()
  const { family, codes, member, canEdit, memberships, people, viewpointId, selfId, advanced, authUser, logout } = store
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [nameDraft, setNameDraft] = useState(null)
  const [familyDraft, setFamilyDraft] = useState(null)

  async function guard(fn, ok) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const base = `${window.location.origin}${import.meta.env.BASE_URL}#`
  const inviteLink = codes ? `${base}/join/${codes.invite_code}` : ''
  const viewLink = codes ? `${base}/view/${codes.view_code}` : ''

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已複製${label}`)
    } catch {
      window.prompt(`請手動複製${label}`, text)
    }
  }

  async function share(kind) {
    const text =
      kind === 'view'
        ? `邀請你查看「${family?.name}」的家族樹!查看碼:${codes?.view_code}\n${viewLink}`
        : `邀請你加入「${family?.name}」的家族樹!邀請碼:${codes?.invite_code}\n${inviteLink}`
    if (navigator.share) {
      try {
        await navigator.share({ title: '家族樹邀請', text })
      } catch {
        /* 使用者取消 */
      }
    } else copy(text, '邀請訊息')
  }

  return (
    <div className="space-y-6">
      {/* 視角 */}
      <section>
        <h2 className="section-title">目前檢視視角</h2>
        <p className="mb-2 text-xs text-muted">所有稱謂都是「這個人眼中看其他人」。切換視角不會改動任何資料,只是重新計算顯示用的稱謂。</p>
        {people.length === 0 ? (
          <p className="empty">還沒有成員,先到「新增」建立第一位成員。</p>
        ) : (
          <>
            <PersonPicker value={viewpointId} onChange={(pid) => guard(() => store.setViewpoint(pid), '已切換視角')} compact />
            {selfId && viewpointId !== selfId && (
              <button onClick={() => guard(() => store.setViewpoint(selfId), '已切回自己的視角')} className="mt-2 text-sm text-primary" disabled={busy}>
                切回我自己的視角
              </button>
            )}
          </>
        )}
      </section>

      {/* 自己是誰 */}
      <section>
        <h2 className="section-title">我在家族樹上是誰</h2>
        <p className="mb-2 text-xs text-muted">這個帳號對應的真實身分節點。可以先不綁定,之後再從樹上選。</p>
        {people.length > 0 && <PersonPicker value={selfId} onChange={(pid) => guard(() => store.setSelf(pid), pid ? '已設定身分' : '已解除綁定')} compact allowNone noneLabel="尚未綁定" />}
      </section>

      {/* 進階稱謂 */}
      <section>
        <h2 className="section-title">進階稱謂模式</h2>
        <label className="card flex items-center justify-between gap-3 p-4">
          <span>
            <span className="block text-sm font-semibold text-ink">啟用進階稱謂</span>
            <span className="block text-xs text-muted">曾祖父母 / 曾孫、伯公 / 姑婆、堂姪 / 表姪、再堂 / 再表兄弟姊妹、妯娌 / 連襟 / 親家…。關閉時這些會以組合式描述(例如「爺爺的爸爸」)呈現。</span>
          </span>
          <Toggle checked={advanced} onChange={(v) => guard(() => store.setAdvanced(v))} disabled={busy} />
        </label>
      </section>

      {/* 邀請 */}
      {canEdit ? (
        <section>
          <h2 className="section-title">邀請家人加入</h2>
          <div className="space-y-3">
            <CodeCard
              title="邀請碼 · 可一起編輯"
              code={codes?.invite_code}
              link={inviteLink}
              busy={busy}
              onCopyCode={() => copy(codes?.invite_code || '', '邀請碼')}
              onShare={() => share('join')}
              onCopyLink={() => copy(inviteLink, '邀請連結')}
              onRegenerate={() => window.confirm('重新產生後,舊的邀請碼與連結會立即失效。確定嗎?') && guard(() => store.regenerateInvite(), '已產生新的邀請碼')}
            />
            <CodeCard
              title="查看碼 · 只能瀏覽"
              code={codes?.view_code}
              link={viewLink}
              busy={busy}
              onCopyCode={() => copy(codes?.view_code || '', '查看碼')}
              onShare={() => share('view')}
              onCopyLink={() => copy(viewLink, '查看連結')}
              onRegenerate={() => window.confirm('重新產生後,舊的查看碼與連結會立即失效。確定嗎?') && guard(() => store.regenerateViewCode(), '已產生新的查看碼')}
            />
          </div>
        </section>
      ) : (
        <section>
          <p className="rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">你是用查看碼加入這個家族的,只能瀏覽,不能新增或修改成員。想一起編輯請向家族成員索取邀請碼。</p>
        </section>
      )}

      {/* 家族與帳號 */}
      <section>
        <h2 className="section-title">家族與帳號</h2>
        <div className="card divide-y divide-line">
          <Row label="家族名稱">
            {!canEdit ? (
              <span className="text-sm text-ink">{family?.name}</span>
            ) : familyDraft === null ? (
              <button onClick={() => setFamilyDraft(family?.name || '')} className="text-sm text-ink">
                {family?.name} <span className="text-muted">✎</span>
              </button>
            ) : (
              <InlineEdit value={familyDraft} onChange={setFamilyDraft} onSave={() => guard(() => store.renameFamily(familyDraft.trim()), '已更新').then(() => setFamilyDraft(null))} onCancel={() => setFamilyDraft(null)} />
            )}
          </Row>
          <Row label="我的顯示名稱">
            {nameDraft === null ? (
              <button onClick={() => setNameDraft(member?.display_name || '')} className="text-sm text-ink">
                {member?.display_name} <span className="text-muted">✎</span>
              </button>
            ) : (
              <InlineEdit value={nameDraft} onChange={setNameDraft} onSave={() => guard(() => store.setDisplayName(nameDraft.trim()), '已更新').then(() => setNameDraft(null))} onCancel={() => setNameDraft(null)} />
            )}
          </Row>
          <Row label="家族成員">
            <span className="text-sm text-ink">{store.members.map((m) => (m.role === 'viewer' ? `${m.display_name}(查看)` : m.display_name)).join('、')}</span>
          </Row>
          <Row label="帳號">
            <span className="text-sm text-ink" data-selectable>
              {authEmailToUsername(authUser?.email)}
            </span>
          </Row>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link to="/family" className="btn-secondary btn-sm">
            {memberships?.length > 1 ? '切換 / 加入其他家族' : '加入或建立其他家族'}
          </Link>
          <button onClick={() => guard(logout)} className="btn-secondary btn-sm">
            登出
          </button>
        </div>
      </section>

      {/* 主題 */}
      <section>
        <h2 className="section-title">外觀主題</h2>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => setTheme(t.id)} className={`card p-4 text-left transition ${theme === t.id ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex gap-1">
                {t.swatch.map((c) => (
                  <span key={c} className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                ))}
              </div>
              <p className="mt-2 font-semibold text-ink">{t.name}</p>
              <p className="text-xs text-muted">{t.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <button
          onClick={() =>
            window.confirm(`確定要離開「${family?.name}」嗎?家族樹資料會保留給其他成員,你之後可以再用邀請碼加入。`) &&
            guard(async () => {
              await store.leaveFamily()
              navigate('/', { replace: true })
            }, '已離開家族')
          }
          disabled={busy}
          className="btn-danger-outline w-full"
        >
          離開這個家族
        </button>
      </section>

      <p className="text-center text-xs text-muted">家族樹 v{__APP_VERSION__}</p>
    </div>
  )
}

function CodeCard({ title, code, link, busy, onCopyCode, onShare, onCopyLink, onRegenerate }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{title}</span>
        <button onClick={onCopyCode} className="font-mono text-2xl font-bold tracking-[0.25em] text-ink" data-selectable>
          {code || '——'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onShare} className="btn-primary btn-sm" disabled={!link}>
          分享連結
        </button>
        <button onClick={onCopyLink} className="btn-secondary btn-sm" disabled={!link}>
          複製連結
        </button>
      </div>
      <button onClick={onRegenerate} className="w-full text-center text-xs text-muted" disabled={busy}>
        重新產生
      </button>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  )
}

function InlineEdit({ value, onChange, onSave, onCancel }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave()
      }}
      className="flex items-center gap-1"
    >
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input w-36 py-1 text-sm" autoFocus />
      <button type="submit" className="btn-primary btn-sm px-2">
        ✓
      </button>
      <button type="button" onClick={onCancel} className="btn-secondary btn-sm px-2">
        ✕
      </button>
    </form>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-primary' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}
