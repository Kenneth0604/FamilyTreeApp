/**
 * 稱謂標籤
 * - exact:正常樣式
 * - approx:中性詞(缺生日或性別未指定),帶「?」提示
 * - fallback:系統無法給出固定稱謂的組合式推算結果,淡色斜體
 * - null:與視角不相連
 */
export default function TermBadge({ result, className = '', size = 'xs', showHint = false }) {
  const text = size === 'sm' ? 'text-sm px-2.5 py-1' : ''
  if (!result) return <span className={`term term-none ${text} ${className}`}>未連結</span>
  const kind = result.kind
  const title =
    result.hint ??
    (kind === 'fallback'
      ? '系統無法給出固定稱謂,以組合方式推算'
      : result.needsBirthday
        ? '填寫生日可讓稱謂更精確'
        : kind === 'approx'
          ? '性別未指定,以中性描述呈現'
          : '')
  return (
    <span className={`term term-${kind} ${text} ${className}`} title={title}>
      {result.term}
      {kind === 'approx' && result.needsBirthday && <span className="ml-0.5 opacity-70">?</span>}
      {showHint && title && <span className="ml-1 font-normal opacity-70">· {title}</span>}
    </span>
  )
}
