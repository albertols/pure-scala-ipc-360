import { useState } from 'react'

export function CopyButton({ value, size = 13 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      style={{
        background: 'none',
        border: 'none',
        padding: '2px 3px',
        cursor: 'pointer',
        color: copied ? '#34d399' : '#4a5570',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        borderRadius: 3,
        transition: 'color 0.15s',
      }}
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
          <path
            d="M2 7l3 3 6-6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
          <rect
            x="4.5"
            y="4.5"
            width="7"
            height="7"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M8.5 4.5V3a1 1 0 00-1-1h-5a1 1 0 00-1 1v5a1 1 0 001 1h1.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}
