export default function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 520" aria-hidden>
      <title>Hello World Cards</title>
      <image href="/images/logo.png" x="48" y="48" width="424" height="420" />
      <g id="wordmark" fontFamily="'Outfit Variable', Arial, Helvetica, sans-serif" fill="#3A322C">
        <text x="544" y="262" fontSize="132" fontWeight="800" letterSpacing="2" className="fill-site-gray-nurse">
          Hello World
        </text>
        <text x="548" y="368" fontSize="80" fontWeight="800" letterSpacing="8" className="fill-site-mantle">
          CARDS
        </text>
      </g>
    </svg>
  )
}
