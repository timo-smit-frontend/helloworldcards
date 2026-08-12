import BannerImage from '~/components/flex/banner/BannerImage'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'

export default function Home() {
  return (
    <>
      <BannerImage
        title="Hello World Cards"
        description="Currently in development"
        image="https://picsum.photos/1920/1080"
        link={{ url: '/products', target: '_self', title: 'View products' }}
      />
      <ContentText
        title="Welcome to Hello World Cards"
        description="We are currently in development. Please check back soon for updates."
      />
      <ContentProducts title="Featured cards" description="A few picks from the shop." id={[1, 2, 3]} />
    </>
  )
}
