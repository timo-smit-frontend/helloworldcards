import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'

export default function Home() {
  return (
    <>
      <ContentText
        title="Welcome to Hello World Cards"
        description="We are currently in development. Please check back soon for updates."
      />
      <ContentProducts title="Our bestselling products" description="A few picks from the shop." id={[1, 2, 3]} />
    </>
  )
}
