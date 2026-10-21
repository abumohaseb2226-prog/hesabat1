'use client'

import { signOut } from 'next-auth/react'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="bg-red-500/20 text-red-300 text-sm font-bold border border-red-500/30 px-4 py-2 rounded-xl hover:bg-red-500/30 transition-colors flex items-center cursor-pointer"
    >
      خروج
    </button>
  )
}