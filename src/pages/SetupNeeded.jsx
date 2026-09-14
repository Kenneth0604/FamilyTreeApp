export default function SetupNeeded() {
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="card p-6">
        <div className="text-3xl">🔧</div>
        <h1 className="mt-2 text-lg font-bold text-ink">尚未設定 Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          請把 <code className="rounded bg-surface-2 px-1">.env.example</code> 複製為{' '}
          <code className="rounded bg-surface-2 px-1">.env.local</code>,填入{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_URL</code> 與{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_ANON_KEY</code> 後重新啟動。
        </p>
        <p className="mt-2 text-sm text-muted">正式部署時請在 GitHub repo 的 Actions secrets 設定同名變數(見 README)。</p>
      </div>
    </div>
  )
}
