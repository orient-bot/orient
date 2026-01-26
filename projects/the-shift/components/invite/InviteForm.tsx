'use client'

import { useState, useCallback } from 'react'

interface InviteFormProps {
  kolCode?: string
}

interface FormData {
  name: string
  email: string
  company: string
  linkedin: string
  twitter: string
}

export default function InviteForm({ kolCode }: InviteFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    linkedin: '',
    twitter: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, kolCode }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setSubmitStatus('success')
      setFormData({ name: '', email: '', company: '', linkedin: '', twitter: '' })
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitStatus === 'success') {
    return (
      <div className="keyboard-container text-center p-8">
        <div className="key w-16 h-16 mx-auto mb-4 flex items-center justify-center text-2xl">
          ✓
        </div>
        <h3 className="text-xl font-bold mb-2 text-text-primary">Application received</h3>
        <p className="text-text-secondary text-sm font-mono">
          // we&apos;ll be in touch
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="keyboard-container space-y-4">
      {submitStatus === 'error' && (
        <div className="key p-3 text-center">
          <span className="text-sm text-red-500 dark:text-red-400">{errorMessage}</span>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          className="input-key"
          placeholder="Your name"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="input-key"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="company" className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
          Company
        </label>
        <input
          type="text"
          id="company"
          name="company"
          value={formData.company}
          onChange={handleChange}
          className="input-key"
          placeholder="Optional"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="linkedin" className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
            LinkedIn
          </label>
          <input
            type="url"
            id="linkedin"
            name="linkedin"
            value={formData.linkedin}
            onChange={handleChange}
            className="input-key text-sm"
            placeholder="linkedin.com/in/..."
          />
        </div>

        <div>
          <label htmlFor="twitter" className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
            X / Twitter
          </label>
          <input
            type="text"
            id="twitter"
            name="twitter"
            value={formData.twitter}
            onChange={handleChange}
            className="input-key text-sm"
            placeholder="@handle"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-key w-full mt-2"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Application'}
      </button>

      <p className="text-center text-text-muted text-xs font-mono">
        // spots are limited
      </p>
    </form>
  )
}
