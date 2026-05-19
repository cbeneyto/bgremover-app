import { useEffect, useState } from "react"

import type { BatchSummary, JobState } from "@shared/protocol"

export function useJobs(): {
  jobs: JobState[]
  summary: BatchSummary
  clear: () => void
} {
  const [jobs, setJobs] = useState<JobState[]>([])
  const [summary, setSummary] = useState<BatchSummary>({
    total: 0,
    done: 0,
    failed: 0,
  })

  useEffect(() => {
    const offJob = window.api.onJobUpdate((state) => {
      setJobs((prev) => {
        const i = prev.findIndex((j) => j.id === state.id)
        if (i < 0) return [...prev, state]
        const next = prev.slice()
        next[i] = state
        return next
      })
    })
    const offSummary = window.api.onBatchSummary((s) => setSummary(s))
    return () => {
      offJob()
      offSummary()
    }
  }, [])

  return {
    jobs,
    summary,
    clear: () => {
      setJobs([])
      setSummary({ total: 0, done: 0, failed: 0 })
    },
  }
}
