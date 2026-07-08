import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname === '/login' || pathname === '/application') {
    const url = request.nextUrl.clone()
    url.pathname = '/Loop.dc.html'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/login',
    '/application',
  ],
}
