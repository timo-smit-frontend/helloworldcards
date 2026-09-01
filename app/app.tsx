import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AdminLoading } from '~/admin/AdminLoading'
import { isAdminHost, isAdminPath } from '~/admin/runtime'
import { CmsProvider } from '~/cms/context'
import CmsPage from '~/cms/CmsPage'
import Seo from '~/components/elements/Seo'
import ScrollToTop from '~/components/layout/ScrollToTop'
import { InitialDocumentProvider } from '~/hooks/initialDocument'

const AdminApp = lazy(() => import('~/admin/AdminApp'))
const Product = lazy(() => import('~/routes/product'))

export function App() {
  const location = useLocation()
  const hostname = typeof window === 'undefined' ? 'helloworldcards.com' : window.location.hostname
  const admin = isAdminPath(location.pathname, hostname)

  return (
    <>
      <ScrollToTop />
      <InitialDocumentProvider>
        <Suspense fallback={admin ? <AdminLoading /> : null}>
          {admin ? (
            <>
              <Seo admin />
              <Routes>
                <Route path={isAdminHost(hostname) ? '/*' : '/admin/*'} element={<AdminApp />} />
              </Routes>
            </>
          ) : (
            <CmsProvider>
              <Seo />
              <Routes>
                <Route path="dashboard/*" element={<Navigate to="/admin/" replace />} />
                <Route path="products/:slug" element={<Product />} />
                <Route path="*" element={<CmsPage />} />
              </Routes>
            </CmsProvider>
          )}
        </Suspense>
      </InitialDocumentProvider>
    </>
  )
}
