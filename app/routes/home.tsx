import BannerImage from '~/components/flex/banner/BannerImage'
import ContentText from '~/components/flex/content/ContentText'

export default function Home() {
  return (
    <>
      <BannerImage
        title="Hello World Cards"
        description="Currently in development"
        image="https://picsum.photos/1920/1080"
        link={{ url: '/agenda', target: '_self', title: 'View our agenda' }}
      />
      <ContentText
        title="Welcome to Hello World Cards"
        description="We are currently in development. Please check back soon for updates."
      />
    </>
  )
}
