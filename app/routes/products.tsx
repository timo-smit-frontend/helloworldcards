import ContentProducts from '~/components/flex/content/ContentProducts'

export default function Products() {
  return (
    <>
      <h1 className="sr-only">All products</h1>
      <ContentProducts title="All products" description="Browse our full collection of cards." />
    </>
  )
}
