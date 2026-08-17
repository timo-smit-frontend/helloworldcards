import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import Seo from '~/components/elements/Seo'
import ScrollToTop from '~/components/layout/ScrollToTop'
import Root from '~/root'
import About from '~/routes/about'
import Agenda from '~/routes/agenda'
import Contact from '~/routes/contact'
import ErrorPage from '~/routes/error'
import Home from '~/routes/home'
import Privacy from '~/routes/privacy'
import Product from '~/routes/product'
import Products from '~/routes/products'
import '~/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Seo />
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
    </BrowserRouter>
  </StrictMode>
)
