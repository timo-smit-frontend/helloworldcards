import ContentText from '~/components/flex/content/ContentText'
import { CONTACT_EMAIL } from '~/services/contact'

export default function Privacy() {
  return (
    <ContentText
      heading="h1"
      title="Privacy statement"
      description="Hello World Cards is a small Pokémon shop run by Sam and Timo. We are not a company. This page says what happens when you visit the site or send us a message, including the contact form."
      image="/images/wooper.png"
      alt="Wooper"
      updated="17 August 2026"
      sections={[
        {
          title: 'Who we are',
          body: (
            <p>
              Hello World Cards is Sam and Timo. We list Pokémon cards here and on Marktplaats, and we write about events we go to. You can
              reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          )
        },
        {
          title: 'Messages you send us',
          body: (
            <p>
              If you use the contact form or email us, we receive your name, email address, and message so we can reply. We do not sell that
              information or use it for ads. If you want a message deleted, email us and we will remove it.
            </p>
          )
        },
        {
          title: 'Google Tag Manager',
          body: (
            <p>
              We use Google Tag Manager to add measurement tools to the site. It may set cookies and load other Google tags. See{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener">
                Google&apos;s privacy policy
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
          )
        },
        {
          title: 'Microsoft Clarity',
          body: (
            <p>
              We use Microsoft Clarity to see how people move around the shop. Clarity uses cookies. See{' '}
              <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noreferrer noopener">
                Microsoft&apos;s privacy statement
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{' '}
              and{' '}
              <a href="https://clarity.microsoft.com/terms" target="_blank" rel="noreferrer noopener">
                Clarity&apos;s terms
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
          )
        },
        {
          title: 'Cookies',
          body: (
            <p>
              Google Tag Manager and Microsoft Clarity may store cookies in your browser. You can block or delete cookies in your browser
              settings. The shop will still work.
            </p>
          )
        }
      ]}
    />
  )
}
