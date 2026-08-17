import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import Seo from '~/components/elements/Seo'
import ScrollToTop from '~/components/layout/ScrollToTop'
import { InitialDocumentProvider } from '~/hooks/initialDocument'
import Root from '~/root'
import Home from '~/routes/home'

const About = lazy(() => import('~/routes/about'))
const Agenda = lazy(() => import('~/routes/agenda'))
const Contact = lazy(() => import('~/routes/contact'))
const Privacy = lazy(() => import('~/routes/privacy'))
const Product = lazy(() => import('~/routes/product'))
const Products = lazy(() => import('~/routes/products'))
const ErrorPage = lazy(() => import('~/routes/error'))

export function App() {
  return (
    <>
      <ScrollToTop />
      <Seo />
      <InitialDocumentProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<Root />}>
              <Route index element={<Home />} />
              <Route path="products" element={<Products />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
            </Route>
            <Route path="products/:slug" element={<Product />} />
            <Route path="*" element={<ErrorPage />} />
          </Routes>
        </Suspense>
      </InitialDocumentProvider>
    </>
  )
}
