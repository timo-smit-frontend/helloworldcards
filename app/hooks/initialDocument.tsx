import { createContext, useContext, useState, type ReactNode } from 'react'
import { useNavigationType } from 'react-router'

const InitialDocumentContext = createContext(true)

export function useInitialDocument() {
  return useContext(InitialDocumentContext)
}

export function InitialDocumentProvider({ children }: { children: ReactNode }) {
  const navigationType = useNavigationType()
  const [isInitialDocument, setIsInitialDocument] = useState(true)

  if (isInitialDocument && (navigationType === 'PUSH' || navigationType === 'REPLACE')) {
    setIsInitialDocument(false)
  }

  return <InitialDocumentContext.Provider value={isInitialDocument}>{children}</InitialDocumentContext.Provider>
}
