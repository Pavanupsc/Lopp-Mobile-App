import './globals.css'

export const metadata = {
  title: 'Loop',
  description: 'Stakes-based accountability — verified by someone you trust.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
