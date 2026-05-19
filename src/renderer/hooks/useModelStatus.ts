import { useEffect, useState } from "react"

import type { ModelStatus } from "@shared/protocol"

export function useModelStatus(): ModelStatus {
  const [status, setStatus] = useState<ModelStatus>({ state: "checking" })

  useEffect(() => {
    let mounted = true
    void window.api.getModelStatus().then((s) => {
      if (mounted) setStatus(s)
    })
    const off = window.api.onModelStatus((s) => {
      if (mounted) setStatus(s)
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  return status
}
